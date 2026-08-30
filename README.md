# backend

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## Swagger API documentation

In local and development environments, Swagger is available without a separate
login at `http://localhost:3000/api-docs`. The full **Try it out** functionality
is enabled there.

Production Swagger is disabled by default. To expose it, configure these values
in the deployment platform's secret manager and restart the service:

```env
NODE_ENV=production
SWAGGER_ENABLED=true
SWAGGER_USERNAME=<non-default-username>
SWAGGER_PASSWORD=<high-entropy-generated-secret>
```

Opening `/api-docs` in production prompts for these separate documentation
credentials. The production UI is read-only: it displays the API contract but
cannot execute requests. If either credential is missing, the documentation
route is not mounted and responds with `404`.

Only expose production Swagger through HTTPS. Do not put credentials in a URL,
source control, logs, or chat. Rotate them in the deployment secret manager and
restart the service whenever someone who knew the shared credentials no longer
needs access.

This project was created using `bun init` in bun v1.3.9. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Chat storage and realtime configuration

Condition chat uses the main PostgreSQL database, Socket.IO on `/socket.io`, and
a private object store for images/PDFs. S3-compatible storage remains the
default; set `CHAT_STORAGE_PROVIDER` to switch new uploads to a private Azure
Blob container without changing the web or Android upload flow.

Shared settings:

```env
CHAT_STORAGE_PROVIDER=s3 # s3 (default) or azure-blob
CHAT_STORAGE_UPLOAD_URL_TTL_SECONDS=900
CHAT_STORAGE_DOWNLOAD_URL_TTL_SECONDS=300
CORS_ORIGINS=https://your-hospital-dashboard.example
```

For S3 or an S3-compatible service:

```env
CHAT_S3_BUCKET=<private-bucket>
CHAT_S3_REGION=<region-or-auto>
CHAT_S3_ENDPOINT=<omit-for-aws-or-set-r2-compatible-endpoint>
CHAT_S3_ACCESS_KEY_ID=<access-key>
CHAT_S3_SECRET_ACCESS_KEY=<secret-key>
CHAT_S3_FORCE_PATH_STYLE=false
```

Allow `PUT` from the hospital frontend origin in the bucket CORS policy and
allow the `Content-Type` header. Keep public bucket access disabled. The legacy
`CHAT_S3_UPLOAD_URL_TTL_SECONDS` and `CHAT_S3_DOWNLOAD_URL_TTL_SECONDS` names
remain supported when their shared equivalents are absent.

For Azure Blob, create a **private** container and use a managed identity or
service principal (recommended):

```env
CHAT_STORAGE_PROVIDER=azure-blob
CHAT_AZURE_STORAGE_AUTH_MODE=identity
CHAT_AZURE_STORAGE_ACCOUNT_NAME=<storage-account-name>
CHAT_AZURE_STORAGE_CONTAINER=chat-attachments
```

`DefaultAzureCredential` is used in identity mode. Assign the backend identity
the **Storage Blob Data Contributor** role at storage-account scope. For a local
service principal, also set `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and
`AZURE_CLIENT_SECRET`.

Alternatively, when the ARM parameter `allowSharedKeyAccess` is `true`, use an
account-key connection string:

```env
CHAT_STORAGE_PROVIDER=azure-blob
CHAT_AZURE_STORAGE_AUTH_MODE=shared-key
CHAT_AZURE_STORAGE_CONNECTION_STRING=<account-key-connection-string>
CHAT_AZURE_STORAGE_CONTAINER=chat-attachments
```

You may instead set `CHAT_AZURE_STORAGE_ACCOUNT_NAME` and
`CHAT_AZURE_STORAGE_ACCOUNT_KEY`. The corresponding `AZURE_STORAGE_*` names are
accepted as fallbacks. `CHAT_AZURE_STORAGE_ENDPOINT` supports sovereign-cloud
or custom endpoints, with `AZURE_STORAGE_BLOB_ENDPOINT` accepted as a fallback;
`CHAT_AZURE_STORAGE_ALLOW_HTTP=true` is only for local Azurite use.

The supplied ARM storage-account resource also needs a container. Add this
resource, keeping its name synchronized with `CHAT_AZURE_STORAGE_CONTAINER`:

```json
{
  "name": "[concat(parameters('storageAccountName'), '/default/chat-attachments')]",
  "type": "Microsoft.Storage/storageAccounts/blobServices/containers",
  "apiVersion": "2025-08-01",
  "properties": { "publicAccess": "None" },
  "dependsOn": [
    "[resourceId('Microsoft.Storage/storageAccounts/blobServices', parameters('storageAccountName'), 'default')]"
  ]
}
```

Merge a CORS policy into the existing blob service's `properties` so browsers
can use the returned upload URL (replace the origin with the deployed web app):

```json
"cors": {
  "corsRules": [
    {
      "allowedOrigins": ["https://your-hospital-dashboard.example"],
      "allowedMethods": ["PUT", "GET", "HEAD", "OPTIONS"],
      "allowedHeaders": ["content-type", "x-ms-blob-type", "x-ms-version"],
      "exposedHeaders": ["etag", "x-ms-request-id"],
      "maxAgeInSeconds": 3600
    }
  ]
}
```

Keep `allowBlobPublicAccess=false` and HTTPS-only traffic enabled. Direct browser
uploads also require the storage firewall/network ACLs to permit the clients'
network path. The API verifies the uploaded size, MIME metadata, and file
signature before accepting a message.

New Azure Blob keys carry their provider internally; existing untagged
attachment keys remain routed to S3 after an `.env` switch. Keep the S3
credentials available while old S3 attachments still need to be read or
deleted. Azure-specific TTL overrides are available as
`CHAT_AZURE_STORAGE_UPLOAD_URL_TTL_SECONDS` and
`CHAT_AZURE_STORAGE_DOWNLOAD_URL_TTL_SECONDS`.

See [.env.example](.env.example) for a copyable configuration. Android
integration details are in [docs/android-chat-api.md](docs/android-chat-api.md).
Set the hospital frontend's `NEXT_PUBLIC_BACKEND_URL` to this backend's HTTPS
origin so Socket.IO connects directly to the long-running service.
