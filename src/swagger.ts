import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { type Express } from 'express';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Alivepost API Documentation',
            version: '1.0.0',
            description: 'API documentation for the Alivepost backend services',
        },
     servers: [
    {
        url: process.env.PUBLIC_URL || 'http://localhost:3000',
        description: process.env.PUBLIC_URL ? 'Production server' : 'Development server',
    },
],
        components: {
            securitySchemes: {
                cookieAuth: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: 'token',
                    description: 'Login to get the token cookie',
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
    apis: ['./src/features/**/*.ts'], // Ensure to point to the controllers
};

export const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app: Express) => {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
};
