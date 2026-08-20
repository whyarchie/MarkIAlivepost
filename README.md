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
