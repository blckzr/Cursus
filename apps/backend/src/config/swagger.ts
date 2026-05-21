import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Student Information System API',
      version: '1.0.0',
      description:
        'REST API for the SIS — manages users, courses, sections, enrollments, and the Excel-like gradebook.',
    },
    servers: [
      {
        url: `http://localhost:${env.port}/api`,
        description: 'Local development',
      },
      {
        url: 'https://your-render-app.onrender.com/api',
        description: 'Production (Render)',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste the JWT token returned by POST /auth/login',
        },
      },
      schemas: {
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'admin@sis.local' },
            password: { type: 'string', example: 'Admin@1234' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            user: { $ref: '#/components/schemas/UserProfile' },
          },
        },
        UserProfile: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            fullName: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'faculty', 'student'] },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'System', description: 'Health and server status' },
      { name: 'Auth', description: 'Login and current user' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/modules/**/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
