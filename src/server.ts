/*!*
 * Copyright (c) 2025 Hangzhou Guanwaii Technology Co,.Ltd.
 *
 * This source code is licensed under the MIT License,
 * which is located in the LICENSE file in the source tree's root directory.
 *
 * File: server.ts
 * Author: mingcheng (mingcheng@apache.org)
 * File Created: 2025-06-23 22:40:57
 *
 * Modified By: mingcheng (mingcheng@apache.org)
 * Last Modified: 2025-07-05 09:23:11
 */

import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosError } from 'axios';
import { UrlShortenRequest, UrlShortenSDK } from 'typescript-sdk-for-sdotee';
import { UrlShortenerError } from 'typescript-sdk-for-sdotee/src/errors.js';
import { UrlShortenDeleteRequest, UrlShortenUpdateRequest } from 'typescript-sdk-for-sdotee/dist/types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// API key from environment variable
const URL_SHORTENER_API_KEY = process.env.URL_SHORTENER_API_KEY || '';
if (!URL_SHORTENER_API_KEY || URL_SHORTENER_API_KEY.trim() === '') {
  throw new Error('URL_SHORTENER_API_KEY environment variable is required');
}

// Base URL for s.ee API
const URL_SHORTENER_API_BASE = process.env.URL_SHORTENER_API_BASE || 'https://s.ee';
const URL_SHORTENER_DEFAULT_DOMAIN = process.env.URL_SHORTENER_DEFAULT_DOMAIN || 's.ee';

export class SeeServer extends McpServer {
  // private server: Server;
  private urlShortenSDK: UrlShortenSDK;

  constructor() {
    super(
      {
        name: 'see-url-shorten-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.urlShortenSDK = new UrlShortenSDK({
      baseUrl: URL_SHORTENER_API_BASE,
      apiKey: URL_SHORTENER_API_KEY,
      timeout: parseInt(process.env.URL_SHORTENER_TIMEOUT || '10000', 10),
    });

    this.setupToolHandlers();
  }

  private setupToolHandlers() {

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_link',
          description: 'Create a new short link on s.ee, asking the user which domain to use',
          inputSchema: {
            type: 'object',
            properties: {
              target_url: {
                type: 'string',
                description: 'The destination URL to shorten',
              },
              slug: {
                type: 'string',
                description: 'Optional custom slug for the short link. If not provided, a random slug will be generated.',
              },
              domain: {
                type: 'string',
                description: ' The shorten domain to use, if not provided, the environment variable URL_SHORTENER_DEFAULT_DOMAIN will be used.',
              },
              title: {
                type: 'string',
                description: 'Optional title for the link',
              },
            },
            required: ['target_url', 'domain'],
          },
        },
        {
          name: 'update_link',
          description: 'Update an existing short link on s.ee',
          inputSchema: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'Optional custom slug for the short link. If not provided, a random slug will be generated.',
              },
              target_url: {
                type: 'string',
                description: 'The new destination URL',
              },
              domain: {
                type: 'string',
                description: ' The shorten domain to use, if not provided, the environment variable URL_SHORTENER_DEFAULT_DOMAIN will be used.',
              },
              title: {
                type: 'string',
                description: 'Optional title for the link',
              },
            },
            required: ['slug', 'target_url', 'domain'],
          },
        },
        {
          name: 'delete_link',
          description: 'Delete an existing short link on s.ee',
          inputSchema: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'Optional custom slug for the short link. If not provided, a random slug will be generated.',
              },
              domain: {
                type: 'string',
                description: ' The shorten domain to use, if not provided, the environment variable URL_SHORTENER_DEFAULT_DOMAIN will be used.',
              },
            },
            required: ['domain', 'slug'],
          },
        },
        {
          name: 'list_domains',
          description: 'List all available domains for shortening links',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      ],
    }));

    // @ts-ignore
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'create_link':
            // @ts-ignore
            return await this.createLink(request.params.arguments);
          case 'update_link':
            // @ts-ignore
            return await this.updateLink(request.params.arguments);
          case 'delete_link':
            // @ts-ignore
            return await this.deleteLink(request.params.arguments);
          case 'list_domains':
            // @ts-ignore
            return await this.listDomains();
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`,
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }

        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError<UrlShortenerError>;
          const statusCode = axiosError.response?.status;
          const errorData = axiosError.response?.data;
          const errorMessage = errorData?.message || axiosError.message;

          return {
            content: [
              {
                type: 'text',
                text: `Error: ${statusCode} - ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Unexpected error: ${(error as Error).message}`,
        );
      }
    });
  }

  private async listDomains(): Promise<any> {
    try {
      const response = await this.urlShortenSDK.listDomains();
      return {
        content: [
          {
            type: 'text',
            text: `Available domains for shortening links${response.data.domains.length > 0 ? `: ${response.data.domains.join(', ')}` : ''}`,
          },
        ],
        isError: false,
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching domains: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async createLink(args: UrlShortenRequest): Promise<any> {
    try {
      if (!args.domain) {
        args.domain = URL_SHORTENER_DEFAULT_DOMAIN;
      }

      const response = await this.urlShortenSDK.create(args);
      return {
        content: [
          {
            type: 'text',
            text: `The original URL is: ${args.target_url}`,
          },
          {
            type: 'text',
            text: `The shortened URL is: ${response.data.short_url}`,
          },
          {
            type: 'text',
            text: `Short link created successfully with slug: ${response.data.slug} on domain: ${args.domain}`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error create shorten url with message: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async updateLink(args: UrlShortenUpdateRequest): Promise<any> {
    try {
      const response = await this.urlShortenSDK.update(args);
      // console.info(response);
      return {
        content: [
          {
            type: 'text',
            text: `The original modified URL is: ${args.target_url}`,
          },
          {
            type: 'text',
            text: `The modified shortened URL's title is: ${args.title}`,
          },
          {
            type: 'text',
            text: `Short link modified successfully with message: ${response.message} on domain: ${args.domain}`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error modify shorten url with message: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }


  private async deleteLink(args: UrlShortenDeleteRequest): Promise<any> {
    try {
      const response = await this.urlShortenSDK.delete(args);
      return {
        content: [
          {
            type: 'text',
            text: 'The deleted URL is successfully deleted',
          },
          {
            type: 'text',
            text: `The link deleted successfully with message: ${response.message} on domain: ${args.domain} with slug ${args.slug}`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error delete url with message: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
}
