import { z } from 'zod';
import { ErrorBodySchema, type ErrorCode, type RouteContract } from '@kitchen/contracts';

/**
 * The OpenAPI document, generated from the contract schemas.
 *
 * Hand-written API documentation is wrong within a sprint, and the version everyone reads
 * is the wrong one. Generating it from the same schemas the server validates against means
 * the description cannot disagree with the behaviour.
 */

const ERROR_STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  session_not_found: 404,
  session_expired: 410,
  join_code_invalid: 404,
  conflict: 409,
  sequence_conflict: 409,
  rate_limited: 429,
  dependency_unavailable: 503,
  provider_unavailable: 503,
  internal: 500,
};

const jsonSchema = (schema: z.ZodTypeAny): unknown => z.toJSONSchema(schema, { io: 'output' });

const jsonBody = (schema: z.ZodTypeAny) => ({
  content: { 'application/json': { schema: jsonSchema(schema) } },
});

export const buildOpenApi = (routes: (RouteContract & { name: string })[]): Record<string, unknown> => {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    const responses: Record<string, unknown> = {
      '200': { description: 'Success', ...jsonBody(route.response) },
    };
    for (const code of route.errors) {
      responses[String(ERROR_STATUS[code])] = {
        description: code,
        ...jsonBody(ErrorBodySchema),
      };
    }
    // Every route can fail unexpectedly; saying so is more honest than implying it cannot.
    responses['500'] = { description: 'internal', ...jsonBody(ErrorBodySchema) };

    const operation: Record<string, unknown> = {
      operationId: route.name,
      summary: route.summary,
      responses,
      ...(route.auth ? { security: [{ deviceToken: [] }] } : { security: [] }),
      ...(route.body ? { requestBody: { required: true, ...jsonBody(route.body) } } : {}),
    };

    paths[route.path] = { ...(paths[route.path] ?? {}), [route.method.toLowerCase()]: operation };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Cookpilot API',
      version: '0.1.0',
      description:
        'Sessions, an ordered event log, and server-authoritative scheduling. Generated from ' +
        'the Zod contracts in @kitchen/contracts; do not edit by hand.',
    },
    components: {
      securitySchemes: {
        deviceToken: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    paths,
  };
};
