import express from 'express';
import { OpenAPIBackend } from 'openapi-backend';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import yaml from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors'
import axios from 'axios';
import { handlers as dynamodbHandlers } from './lib/dynamodb-handlers.js';
import dotenv from 'dotenv';
import { saveSingleExecutionLog } from './executionHandler.js';
import serverless from 'serverless-http';

dotenv.config();  

const app = express();
app.use(express.json());
app.use(cors());
// File storage configuration
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);



app.get("/test",(req,res)=>{res.send("hello! world");
})

// Initialize main OpenAPI backend
const mainApi = new OpenAPIBackend({
  definition: './openapi.yaml',
  quick: true,
  handlers: {
    validationFail: async (c, req, res) => ({
      statusCode: 400,
      error: c.validation.errors
    }),
    notFound: async (c, req, res) => ({
      statusCode: 404,
      error: 'Not Found'
    }),

   
    executeNamespaceRequest: async (c, req, res) => {
      console.log('Executing request with params:', {
        method: c.request.requestBody.method,
        url: c.request.requestBody.url
      });

      const { method, url, queryParams = {}, headers = {}, body = null } = c.request.requestBody;
      const execId = uuidv4();
      
      try {
        // Build URL with query parameters
        const urlObj = new URL(url);
        Object.entries(queryParams).forEach(([key, value]) => {
          if (key && value && key.trim() !== '') {
            urlObj.searchParams.append(key.trim(), value.toString().trim());
          }
        });

        console.log('Final URL:', urlObj.toString());

        // Make the request
        const response = await axios({
          method: method.toUpperCase(),
          url: urlObj.toString(),
          headers: headers,
          data: body,
          validateStatus: () => true // Don't throw on any status
        });

        console.log('Response received:', {
          status: response.status,
          statusText: response.statusText
        });

        // Save execution log
        await saveSingleExecutionLog({
          execId,
          method,
          url: urlObj.toString(),
          queryParams,
          headers,
          responseStatus: response.status,
          responseData: response.data
        });

        // Handle authentication errors specifically
        if (response.status === 401 || response.status === 403) {
          return {
            statusCode: response.status,
            body: {
              error: 'Authentication Failed',
              status: response.status,
              statusText: response.statusText,
              details: response.data,
              suggestions: [
                'Check if the authentication token/key is correct and complete',
                'Verify the token has not expired',
                'Ensure the token has the necessary permissions',
                'Verify you are using the correct authentication method'
              ]
            }
          };
        }

        // Handle other errors
        if (response.status >= 400) {
          return {
            statusCode: response.status,
            body: {
              error: 'API Request Failed',
              status: response.status,
              statusText: response.statusText,
              details: response.data
            }
          };
        }

        return {
          statusCode: response.status,
          body: response.data
        };
      } catch (error) {
        console.error('Request execution error:', {
          message: error.message,
          code: error.code
        });

        // Handle specific error types
        if (error.code === 'ECONNREFUSED') {
          return {
            statusCode: 500,
            body: {
              error: 'Connection Failed',
              details: 'Could not connect to the server. The service might be down or the URL might be incorrect.',
              code: error.code
            }
          };
        }

        return {
          statusCode: 500,
          body: { 
            error: 'Failed to execute request',
            details: error.message,
            code: error.code,
            suggestions: [
              'Verify the URL is correct and accessible',
              'Check if all required headers are properly formatted',
              'Verify the HTTP method is supported',
              'Ensure the request body is properly formatted (if applicable)',
              'Check your network connection'
            ]
          }
        };
      }
    }
     
  }
});

// Initialize AWS DynamoDB OpenAPI backend
const awsApi = new OpenAPIBackend({
  definition: './swagger/aws-dynamodb.yaml',
  quick: true,
  handlers: {
    validationFail: async (c, req, res) => ({
      statusCode: 400,
      error: c.validation.errors
    }),
    notFound: async (c, req, res) => ({
      statusCode: 404,
      error: 'Not Found'
    }),
    // Table Operations
  
    createTable: dynamodbHandlers.createTable,
   
    createItem: dynamodbHandlers.createItem,
   
  }
});

// Initialize Pinterest OpenAPI backend



// Initialize AWS Messaging OpenAPI backend


// Initialize all APIs
await Promise.all([
  mainApi.init(),
  awsApi.init(),
 
]);

// Helper function to handle requests


// Serve Swagger UI for all APIs
const mainOpenapiSpec = yaml.load(fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8'));
const awsOpenapiSpec = yaml.load(fs.readFileSync(path.join(__dirname, 'swagger/aws-dynamodb.yaml'), 'utf8'));

// Configure route handlers for API documentation
app.get('/api-docs/swagger.json', (req, res) => {
  res.json(mainOpenapiSpec);
});



// Serve main API docs
app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', (req, res) => {
  res.send(
    swaggerUi.generateHTML(mainOpenapiSpec, {
      customSiteTitle: "Main API Documentation",
      customfavIcon: "/favicon.ico",
      customCss: '.swagger-ui .topbar { display: none }',
      swaggerUrl: "/api-docs/swagger.json"
    })
  );
});

// Serve AWS API docs
app.use('/aws-api-docs', swaggerUi.serve);
app.get('/aws-api-docs', (req, res) => {
  res.send(
    swaggerUi.generateHTML(awsOpenapiSpec, {
      customSiteTitle: "AWS DynamoDB API Documentation",
      customfavIcon: "/favicon.ico",
      customCss: '.swagger-ui .topbar { display: none }',
      swaggerUrl: "/aws-api-docs/swagger.json"
    })
  );
});

// Serve AWS API docs at the DynamoDB base URL
app.use('/api/dynamodb', swaggerUi.serve);
app.get('/api/dynamodb', (req, res) => {
  res.send(
    swaggerUi.generateHTML(awsOpenapiSpec, {
      customSiteTitle: "AWS DynamoDB API Documentation",
      customfavIcon: "/favicon.ico",
      customCss: '.swagger-ui .topbar { display: none }',
      swaggerUrl: "/api/dynamodb/swagger.json"
    })
  );
});

// Serve DynamoDB OpenAPI specification
app.get('/api/dynamodb/swagger.json', (req, res) => {
  res.json(awsOpenapiSpec);
});







app.post('/execute', async (req, res) => {
  try {
    const response = await mainApi.handleRequest(
      {
        method: 'POST',
        path: '/execute',
        body: req.body,
        headers: req.headers
      },
      req,
      res
    );
    res.status(response.statusCode).json(response.body);
  } catch (error) {
    console.error('Execute request error:', error);
    res.status(500).json({ error: 'Failed to execute request' });
  }
});

// const PORT = process.env.PORT || 5000;
// app.listen(PORT, '0.0.0.0', () => {
//   console.log(`Server listening on port ${PORT}`);
 
// });

export const handler = serverless(app);

