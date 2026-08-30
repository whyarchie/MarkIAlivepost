import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DefaultAzureCredential } from "@azure/identity";
import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  StorageSharedKeyCredential,
  type BlobGenerateSasUrlOptions,
  type BlockBlobClient,
} from "@azure/storage-blob";
import { AppError } from "../../utils/AppError";

export const CHAT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const CHAT_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export type ChatStorageProvider = "s3" | "azure-blob";

export function matchesAttachmentSignature(mimeType: string, sample: Uint8Array) {
  const bytes = Buffer.from(sample);
  return (
    (mimeType === "image/jpeg" &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff) ||
    (mimeType === "image/png" &&
      bytes
        .subarray(0, 8)
        .equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        )) ||
    (mimeType === "image/webp" &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP") ||
    (mimeType === "application/pdf" &&
      bytes.subarray(0, 5).toString("ascii") === "%PDF-")
  );
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const AZURE_BLOB_KEY_PREFIX = "azure-blob:";
const MAX_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
const AZURE_SAS_CLOCK_SKEW_SECONDS = 5 * 60;
const MAX_AZURE_SAS_TTL_SECONDS =
  MAX_SIGNED_URL_TTL_SECONDS - AZURE_SAS_CLOCK_SKEW_SECONDS;

type S3StorageConfig = {
  client: S3Client;
  bucket: string;
  uploadUrlTtlSeconds: number;
  downloadUrlTtlSeconds: number;
};

type AzureStorageAuthMode = "shared-key" | "identity";

type AzureStorageConfig = {
  serviceClient: BlobServiceClient;
  containerName: string;
  authMode: AzureStorageAuthMode;
  protocol: SASProtocol;
  uploadUrlTtlSeconds: number;
  downloadUrlTtlSeconds: number;
};

let cachedS3Config: S3StorageConfig | undefined;
let cachedAzureConfig: AzureStorageConfig | undefined;

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readSignedUrlTtl(
  value: string | undefined,
  fallback: number,
  maximum = MAX_SIGNED_URL_TTL_SECONDS,
): number {
  return Math.min(readPositiveInteger(value, fallback), maximum);
}

export function resolveChatStorageProvider(
  value?: string,
): ChatStorageProvider {
  const normalized = (value || "s3").trim().toLowerCase();
  if (normalized === "s3") return "s3";
  if (
    normalized === "blob" ||
    normalized === "azure" ||
    normalized === "azure-blob" ||
    normalized === "azure_blob"
  ) {
    return "azure-blob";
  }
  throw new AppError(
    "CHAT_STORAGE_PROVIDER must be either s3 or azure-blob",
    503,
  );
}

export function resolveAttachmentStorageLocation(storageKey: string): {
  provider: ChatStorageProvider;
  objectKey: string;
} {
  if (storageKey.startsWith(AZURE_BLOB_KEY_PREFIX)) {
    return {
      provider: "azure-blob",
      objectKey: storageKey.slice(AZURE_BLOB_KEY_PREFIX.length),
    };
  }

  // All keys created before provider selection was introduced were S3 keys.
  return { provider: "s3", objectKey: storageKey };
}

function configuredUploadTtl(
  providerSpecificValue: string | undefined,
  maximum?: number,
) {
  return readSignedUrlTtl(
    process.env.CHAT_STORAGE_UPLOAD_URL_TTL_SECONDS ?? providerSpecificValue,
    900,
    maximum,
  );
}

function configuredDownloadTtl(
  providerSpecificValue: string | undefined,
  maximum?: number,
) {
  return readSignedUrlTtl(
    process.env.CHAT_STORAGE_DOWNLOAD_URL_TTL_SECONDS ?? providerSpecificValue,
    300,
    maximum,
  );
}

function s3StorageConfig(): S3StorageConfig {
  if (cachedS3Config) return cachedS3Config;

  const bucket = process.env.CHAT_S3_BUCKET;
  const accessKeyId = process.env.CHAT_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CHAT_S3_SECRET_ACCESS_KEY;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new AppError("S3 chat attachment storage is not configured", 503);
  }

  cachedS3Config = {
    bucket,
    uploadUrlTtlSeconds: configuredUploadTtl(
      process.env.CHAT_S3_UPLOAD_URL_TTL_SECONDS,
    ),
    downloadUrlTtlSeconds: configuredDownloadTtl(
      process.env.CHAT_S3_DOWNLOAD_URL_TTL_SECONDS,
    ),
    client: new S3Client({
      region: process.env.CHAT_S3_REGION || "auto",
      endpoint: process.env.CHAT_S3_ENDPOINT || undefined,
      forcePathStyle: process.env.CHAT_S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId, secretAccessKey },
    }),
  };

  return cachedS3Config;
}

function resolveAzureAuthMode(
  value: string | undefined,
  hasSharedKeyCredentials: boolean,
): AzureStorageAuthMode {
  const normalized = (
    value || (hasSharedKeyCredentials ? "shared-key" : "identity")
  )
    .trim()
    .toLowerCase();

  if (normalized === "shared-key" || normalized === "shared_key") {
    return "shared-key";
  }
  if (
    normalized === "identity" ||
    normalized === "entra" ||
    normalized === "managed-identity" ||
    normalized === "managed_identity"
  ) {
    return "identity";
  }

  throw new AppError(
    "CHAT_AZURE_STORAGE_AUTH_MODE must be either shared-key or identity",
    503,
  );
}

function azureStorageConfig(): AzureStorageConfig {
  if (cachedAzureConfig) return cachedAzureConfig;

  const containerName =
    process.env.CHAT_AZURE_STORAGE_CONTAINER ||
    process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME;
  const connectionString =
    process.env.CHAT_AZURE_STORAGE_CONNECTION_STRING ||
    process.env.AZURE_STORAGE_CONNECTION_STRING;
  const accountName =
    process.env.CHAT_AZURE_STORAGE_ACCOUNT_NAME ||
    process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const accountKey =
    process.env.CHAT_AZURE_STORAGE_ACCOUNT_KEY ||
    process.env.AZURE_STORAGE_ACCOUNT_KEY;
  const hasSharedKeyCredentials = Boolean(
    connectionString || (accountName && accountKey),
  );
  const authMode = resolveAzureAuthMode(
    process.env.CHAT_AZURE_STORAGE_AUTH_MODE,
    hasSharedKeyCredentials,
  );

  if (!containerName) {
    throw new AppError(
      "Azure Blob chat attachment storage is not configured: container is missing",
      503,
    );
  }

  let serviceClient: BlobServiceClient;
  if (authMode === "shared-key") {
    if (connectionString) {
      serviceClient = BlobServiceClient.fromConnectionString(connectionString);
    } else if (accountName && accountKey) {
      const endpoint = (
        process.env.CHAT_AZURE_STORAGE_ENDPOINT ||
        process.env.AZURE_STORAGE_BLOB_ENDPOINT ||
        `https://${accountName}.blob.core.windows.net`
      ).replace(/\/+$/, "");
      serviceClient = new BlobServiceClient(
        endpoint,
        new StorageSharedKeyCredential(accountName, accountKey),
      );
    } else {
      throw new AppError(
        "Azure Blob shared-key authentication is not configured",
        503,
      );
    }
  } else {
    if (!accountName) {
      throw new AppError(
        "Azure Blob identity authentication requires an account name",
        503,
      );
    }
    const endpoint = (
      process.env.CHAT_AZURE_STORAGE_ENDPOINT ||
      process.env.AZURE_STORAGE_BLOB_ENDPOINT ||
      `https://${accountName}.blob.core.windows.net`
    ).replace(/\/+$/, "");
    serviceClient = new BlobServiceClient(
      endpoint,
      new DefaultAzureCredential(),
    );
  }

  cachedAzureConfig = {
    serviceClient,
    containerName,
    authMode,
    protocol:
      process.env.CHAT_AZURE_STORAGE_ALLOW_HTTP === "true"
        ? SASProtocol.HttpsAndHttp
        : SASProtocol.Https,
    uploadUrlTtlSeconds: configuredUploadTtl(
      process.env.CHAT_AZURE_STORAGE_UPLOAD_URL_TTL_SECONDS,
      MAX_AZURE_SAS_TTL_SECONDS,
    ),
    downloadUrlTtlSeconds: configuredDownloadTtl(
      process.env.CHAT_AZURE_STORAGE_DOWNLOAD_URL_TTL_SECONDS,
      MAX_AZURE_SAS_TTL_SECONDS,
    ),
  };

  return cachedAzureConfig;
}

function azureBlobClient(config: AzureStorageConfig, objectKey: string) {
  return config.serviceClient
    .getContainerClient(config.containerName)
    .getBlockBlobClient(objectKey);
}

function azureSasWindow(ttlSeconds: number) {
  const now = Date.now();
  return {
    startsOn: new Date(now - AZURE_SAS_CLOCK_SKEW_SECONDS * 1000),
    expiresOn: new Date(now + ttlSeconds * 1000),
  };
}

async function generateAzureSasUrl(
  config: AzureStorageConfig,
  client: BlockBlobClient,
  options: BlobGenerateSasUrlOptions & { startsOn: Date; expiresOn: Date },
) {
  try {
    if (config.authMode === "shared-key") {
      return await client.generateSasUrl(options);
    }

    const delegationKey = await config.serviceClient.getUserDelegationKey(
      options.startsOn,
      options.expiresOn,
    );
    return await client.generateUserDelegationSasUrl(options, delegationKey);
  } catch {
    throw new AppError(
      "Azure Blob authentication failed; configure a managed identity, service principal, or shared-key connection string",
      503,
    );
  }
}

export function createAttachmentIdentity(
  conditionId: number,
  mimeType: string,
  provider = resolveChatStorageProvider(process.env.CHAT_STORAGE_PROVIDER),
): { id: string; storageKey: string } {
  const id = randomUUID();
  const extension = EXTENSIONS[mimeType];
  if (!extension) throw new AppError("Unsupported attachment type", 400);

  const objectKey = `chat/${conditionId}/${id}${extension}`;
  return {
    id,
    storageKey:
      provider === "azure-blob"
        ? `${AZURE_BLOB_KEY_PREFIX}${objectKey}`
        : objectKey,
  };
}

async function createS3UploadUrl(input: {
  objectKey: string;
  mimeType: string;
  byteSize: number;
}) {
  const config = s3StorageConfig();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.objectKey,
    ContentType: input.mimeType,
    ContentLength: input.byteSize,
  });
  const uploadUrl = await getSignedUrl(config.client, command, {
    expiresIn: config.uploadUrlTtlSeconds,
  });
  return {
    uploadUrl,
    expiresInSeconds: config.uploadUrlTtlSeconds,
    requiredHeaders: { "Content-Type": input.mimeType },
  };
}

async function createAzureUploadUrl(input: {
  objectKey: string;
  mimeType: string;
  byteSize: number;
}) {
  const config = azureStorageConfig();
  const client = azureBlobClient(config, input.objectKey);
  const uploadUrl = await generateAzureSasUrl(config, client, {
    ...azureSasWindow(config.uploadUrlTtlSeconds),
    permissions: BlobSASPermissions.parse("c"),
    protocol: config.protocol,
  });
  const serviceVersion = new URL(uploadUrl).searchParams.get("sv");

  return {
    uploadUrl,
    expiresInSeconds: config.uploadUrlTtlSeconds,
    requiredHeaders: {
      "Content-Type": input.mimeType,
      "x-ms-blob-type": "BlockBlob",
      ...(serviceVersion ? { "x-ms-version": serviceVersion } : {}),
    },
  };
}

export async function createUploadUrl(input: {
  storageKey: string;
  mimeType: string;
  byteSize: number;
}) {
  const location = resolveAttachmentStorageLocation(input.storageKey);
  const providerInput = { ...input, objectKey: location.objectKey };
  return location.provider === "azure-blob"
    ? createAzureUploadUrl(providerInput)
    : createS3UploadUrl(providerInput);
}

function uploadedObjectMatches(input: {
  expectedMimeType: string;
  expectedByteSize: number;
  actualMimeType: string | undefined;
  actualByteSize: number | undefined;
}) {
  const actualMimeType = input.actualMimeType?.split(";", 1)[0]?.trim();
  return (
    input.actualByteSize === input.expectedByteSize &&
    actualMimeType === input.expectedMimeType &&
    CHAT_ATTACHMENT_MIME_TYPES.has(actualMimeType || "") &&
    (input.actualByteSize ?? 0) <= CHAT_MAX_ATTACHMENT_BYTES
  );
}

async function verifyS3Object(input: {
  objectKey: string;
  expectedMimeType: string;
  expectedByteSize: number;
}) {
  const config = s3StorageConfig();
  let object;
  try {
    object = await config.client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: input.objectKey }),
    );
  } catch {
    throw new AppError("Attachment upload has not completed", 409);
  }

  if (
    !uploadedObjectMatches({
      ...input,
      actualMimeType: object.ContentType,
      actualByteSize: object.ContentLength,
    })
  ) {
    await deleteS3Object(input.objectKey).catch(() => undefined);
    throw new AppError(
      "Uploaded attachment does not match its declared type or size",
      400,
    );
  }

  const sampleObject = await config.client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: input.objectKey,
      Range: "bytes=0-15",
    }),
  );
  const sample = Buffer.from(
    (await sampleObject.Body?.transformToByteArray()) || new Uint8Array(),
  );
  if (!matchesAttachmentSignature(input.expectedMimeType, sample)) {
    await deleteS3Object(input.objectKey).catch(() => undefined);
    throw new AppError(
      "Attachment contents do not match the declared file type",
      400,
    );
  }
}

async function verifyAzureObject(input: {
  objectKey: string;
  expectedMimeType: string;
  expectedByteSize: number;
}) {
  const config = azureStorageConfig();
  const client = azureBlobClient(config, input.objectKey);
  let object;
  try {
    object = await client.getProperties();
  } catch {
    throw new AppError("Attachment upload has not completed", 409);
  }

  if (
    (object.blobType !== undefined && object.blobType !== "BlockBlob") ||
    !uploadedObjectMatches({
      ...input,
      actualMimeType: object.contentType,
      actualByteSize: object.contentLength,
    })
  ) {
    await deleteAzureObject(input.objectKey).catch(() => undefined);
    throw new AppError(
      "Uploaded attachment does not match its declared type or size",
      400,
    );
  }

  const sample = await client.downloadToBuffer(0, 16);
  if (!matchesAttachmentSignature(input.expectedMimeType, sample)) {
    await deleteAzureObject(input.objectKey).catch(() => undefined);
    throw new AppError(
      "Attachment contents do not match the declared file type",
      400,
    );
  }
}

export async function verifyUploadedObject(input: {
  storageKey: string;
  expectedMimeType: string;
  expectedByteSize: number;
}) {
  const location = resolveAttachmentStorageLocation(input.storageKey);
  const providerInput = { ...input, objectKey: location.objectKey };
  return location.provider === "azure-blob"
    ? verifyAzureObject(providerInput)
    : verifyS3Object(providerInput);
}

function safeInlineName(originalName: string) {
  return originalName.replace(/[\r\n"]/g, "_");
}

async function createS3DownloadUrl(
  objectKey: string,
  originalName: string,
  mimeType: string,
) {
  const config = s3StorageConfig();
  const downloadUrl = await getSignedUrl(
    config.client,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      ResponseContentType: mimeType,
      ResponseContentDisposition: `inline; filename="${safeInlineName(originalName)}"`,
    }),
    { expiresIn: config.downloadUrlTtlSeconds },
  );
  return { downloadUrl, expiresInSeconds: config.downloadUrlTtlSeconds };
}

async function createAzureDownloadUrl(
  objectKey: string,
  originalName: string,
  mimeType: string,
) {
  const config = azureStorageConfig();
  const client = azureBlobClient(config, objectKey);
  const downloadUrl = await generateAzureSasUrl(config, client, {
    ...azureSasWindow(config.downloadUrlTtlSeconds),
    permissions: BlobSASPermissions.parse("r"),
    protocol: config.protocol,
    contentType: mimeType,
    contentDisposition: `inline; filename="${safeInlineName(originalName)}"`,
  });
  return {
    downloadUrl,
    expiresInSeconds: config.downloadUrlTtlSeconds,
  };
}

export async function createDownloadUrl(
  storageKey: string,
  originalName: string,
  mimeType: string,
) {
  const location = resolveAttachmentStorageLocation(storageKey);
  return location.provider === "azure-blob"
    ? createAzureDownloadUrl(location.objectKey, originalName, mimeType)
    : createS3DownloadUrl(location.objectKey, originalName, mimeType);
}

async function deleteS3Object(objectKey: string) {
  const config = s3StorageConfig();
  await config.client.send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }),
  );
}

async function deleteAzureObject(objectKey: string) {
  const config = azureStorageConfig();
  await azureBlobClient(config, objectKey).deleteIfExists({
    deleteSnapshots: "include",
  });
}

export async function deleteStoredObject(storageKey: string) {
  const location = resolveAttachmentStorageLocation(storageKey);
  return location.provider === "azure-blob"
    ? deleteAzureObject(location.objectKey)
    : deleteS3Object(location.objectKey);
}
