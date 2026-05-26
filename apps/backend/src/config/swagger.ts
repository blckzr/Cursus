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
          required: ['userCode', 'password'],
          properties: {
            userCode: { type: 'string', example: '2026-00001-MN-2', description: 'User code in the format YYYY-NNNNN-BRANCH-ROLE' },
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
      { name: 'System',      description: 'Health and server status' },
      { name: 'Auth',        description: 'Login and current user' },
      { name: 'Users',       description: 'User management (admin)' },
      { name: 'Programs',    description: 'Degree programs' },
      { name: 'Courses',     description: 'Course catalog' },
      { name: 'Terms',       description: 'Academic terms / semesters' },
      { name: 'Sections',    description: 'Course sections (offerings)' },
      { name: 'Enrollments', description: 'Student enrollment in sections' },
      { name: 'Blocks',      description: 'Year/program cohort blocks and promotion' },
      { name: 'Curriculum',  description: 'Per-program course placement (year + semester)' },
      { name: 'Availability', description: 'Faculty weekly teaching + office-hour slots' },
      { name: 'AuditLogs',    description: 'Append-only system activity log (admin)' },
      { name: 'Gradebook',   description: 'Categories, assessments, scores, and final grades' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/modules/**/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
