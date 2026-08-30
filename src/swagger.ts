import { createHash, timingSafeEqual } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

type SwaggerEnvironment = {
  NODE_ENV?: string;
  PUBLIC_URL?: string;
  SWAGGER_ENABLED?: string;
  SWAGGER_USERNAME?: string;
  SWAGGER_PASSWORD?: string;
};

const SWAGGER_PATH = "/api-docs";

function createSwaggerSpec(env: SwaggerEnvironment) {
  const options: swaggerJsdoc.Options = {
    definition: {
      openapi: "3.0.0",
      info: {
        title: "Alivepost API Documentation",
        version: "1.0.0",
        description: "API documentation for the Alivepost backend services",
      },
      servers: [
        {
          url: env.PUBLIC_URL || "http://localhost:3000",
          description: env.PUBLIC_URL
            ? "Production server"
            : "Development server",
        },
      ],
      components: {
        securitySchemes: {
          cookieAuth: {
            type: "apiKey",
            in: "cookie",
            name: "token",
            description: "Login to get the token cookie",
          },
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Android/native clients send the JWT returned by login",
          },
        },
      },
      security: [
        {
          cookieAuth: [],
        },
      ],
    },
    // Path to the API docs
    apis: ["./src/features/**/*.ts"],
  };

  return swaggerJsdoc(options);
}

// Retain the existing export for callers that consume the generated document.
export const swaggerSpec = createSwaggerSpec(process.env);

function constantTimeEqual(actual: string, expected: string): boolean {
  // Hashing first gives timingSafeEqual fixed-size inputs even when the supplied
  // and configured credentials have different lengths.
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();

  return timingSafeEqual(actualDigest, expectedDigest);
}

function readBasicCredentials(
  authorizationHeader: string | undefined
): { username: string; password: string } | undefined {
  if (!authorizationHeader) {
    return undefined;
  }

  const match = authorizationHeader.match(/^Basic\s+(.+)$/i);
  if (!match?.[1]) {
    return undefined;
  }

  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex < 0) {
    return undefined;
  }

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  };
}

function createSwaggerBasicAuth(username: string, password: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const supplied = readBasicCredentials(req.get("authorization"));
    const usernameMatches = constantTimeEqual(
      supplied?.username ?? "",
      username
    );
    const passwordMatches = constantTimeEqual(
      supplied?.password ?? "",
      password
    );

    if (!supplied || !usernameMatches || !passwordMatches) {
      res.set(
        "WWW-Authenticate",
        'Basic realm="Alivepost API documentation", charset="UTF-8"'
      );
      res.status(401).type("text/plain").send("Authentication required");
      return;
    }

    next();
  };
}

function setProductionSwaggerHeaders(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  res.set({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "X-Robots-Tag": "noindex, nofollow",
  });
  next();
}

export function setupSwagger(
  app: Express,
  env: SwaggerEnvironment = process.env
): void {
  const isProduction = env.NODE_ENV === "production";

  if (isProduction && env.SWAGGER_ENABLED?.toLowerCase() !== "true") {
    return;
  }

  const username = env.SWAGGER_USERNAME;
  const password = env.SWAGGER_PASSWORD;

  if (isProduction && (!username || !password)) {
    console.warn(
      "[Swagger] Production documentation was not mounted because SWAGGER_USERNAME or SWAGGER_PASSWORD is missing."
    );
    return;
  }

  const spec = createSwaggerSpec(env);
  const uiOptions: swaggerUi.SwaggerUiOptions = {
    customSiteTitle: "Alivepost API Documentation",
    swaggerOptions: {
      // Avoid sending the API description to an external validator service.
      validatorUrl: null,
      ...(isProduction ? { supportedSubmitMethods: [] } : {}),
    },
  };
  const swaggerHandlers = [
    ...swaggerUi.serveFiles(spec, uiOptions),
    swaggerUi.setup(spec, uiOptions),
  ];

  if (isProduction) {
    app.use(
      SWAGGER_PATH,
      setProductionSwaggerHeaders,
      createSwaggerBasicAuth(username!, password!),
      swaggerHandlers
    );
    return;
  }

  app.use(SWAGGER_PATH, swaggerHandlers);
}
