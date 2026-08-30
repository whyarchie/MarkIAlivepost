import { afterEach, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setupSwagger } from "./swagger";

type TestEnvironment = Parameters<typeof setupSwagger>[1];

const runningServers: Server[] = [];

function basicAuthorization(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function startSwaggerServer(env: TestEnvironment): Promise<string> {
  const app = express();
  setupSwagger(app, env);
  app.use((_req, res) => res.status(404).send("Not found"));

  const server = await new Promise<Server>((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () => {
      resolve(listeningServer);
    });
  });

  runningServers.push(server);
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port");
  }

  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    runningServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

describe("Swagger access", () => {
  test("is fully accessible without documentation credentials in development", async () => {
    const baseUrl = await startSwaggerServer({ NODE_ENV: "development" });

    const pageResponse = await fetch(`${baseUrl}/api-docs/`);
    const initResponse = await fetch(`${baseUrl}/api-docs/swagger-ui-init.js`);
    const initScript = await initResponse.text();

    expect(pageResponse.status).toBe(200);
    expect(initResponse.status).toBe(200);
    expect(initScript).not.toContain("supportedSubmitMethods");
  });

  test("does not mount production Swagger unless explicitly enabled", async () => {
    const baseUrl = await startSwaggerServer({
      NODE_ENV: "production",
      SWAGGER_USERNAME: "docs-user",
      SWAGGER_PASSWORD: "docs-password",
    });

    const response = await fetch(`${baseUrl}/api-docs/`);

    expect(response.status).toBe(404);
  });

  test("fails closed when enabled without complete production credentials", async () => {
    const baseUrl = await startSwaggerServer({
      NODE_ENV: "production",
      SWAGGER_ENABLED: "true",
      SWAGGER_USERNAME: "docs-user",
    });

    const response = await fetch(`${baseUrl}/api-docs/`);

    expect(response.status).toBe(404);
  });

  test("challenges missing and incorrect production credentials", async () => {
    const baseUrl = await startSwaggerServer({
      NODE_ENV: "production",
      SWAGGER_ENABLED: "true",
      SWAGGER_USERNAME: "docs-user",
      SWAGGER_PASSWORD: "docs-password",
    });

    const missingResponse = await fetch(`${baseUrl}/api-docs/`);
    const incorrectResponse = await fetch(`${baseUrl}/api-docs/swagger-ui.css`, {
      headers: {
        Authorization: basicAuthorization("docs-user", "wrong-password"),
      },
    });

    expect(missingResponse.status).toBe(401);
    expect(missingResponse.headers.get("www-authenticate")).toContain("Basic");
    expect(missingResponse.headers.get("cache-control")).toContain("no-store");
    expect(missingResponse.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow"
    );
    expect(incorrectResponse.status).toBe(401);
  });

  test("serves all Swagger assets with correct production credentials", async () => {
    const baseUrl = await startSwaggerServer({
      NODE_ENV: "production",
      SWAGGER_ENABLED: "TRUE",
      SWAGGER_USERNAME: "docs-user",
      SWAGGER_PASSWORD: "docs:password",
    });
    const headers = {
      Authorization: basicAuthorization("docs-user", "docs:password"),
    };

    const pageResponse = await fetch(`${baseUrl}/api-docs/`, { headers });
    const assetResponse = await fetch(`${baseUrl}/api-docs/swagger-ui.css`, {
      headers,
    });
    const initResponse = await fetch(`${baseUrl}/api-docs/swagger-ui-init.js`, {
      headers,
    });
    const initScript = await initResponse.text();

    expect(pageResponse.status).toBe(200);
    expect(assetResponse.status).toBe(200);
    expect(initResponse.status).toBe(200);
    expect(initScript).toContain('"supportedSubmitMethods": []');
    expect(initScript).toContain('"validatorUrl": null');
  });
});
