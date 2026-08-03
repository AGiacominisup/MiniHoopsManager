export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "MiniHoopsManager API",
    version: "1.0.0",
    description: "API per la gestione di tornei minibasket"
  },
  servers: [
    {
      url: "/",
      description: "Current server"
    }
  ],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Tournaments" }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    schemas: {
      RegisterRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "admin@minihoops.com" },
          password: { type: "string", minLength: 8, example: "superPassword123" },
          role: { type: "string", enum: ["admin", "coach", "staff"], example: "admin" }
        }
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "admin@minihoops.com" },
          password: { type: "string", minLength: 8, example: "superPassword123" }
        }
      },
      AuthResponse: {
        type: "object",
        properties: {
          message: { type: "string", example: "Login successful" },
          token: { type: "string" },
          user: {
            type: "object",
            properties: {
              id: { type: "string" },
              email: { type: "string", format: "email" },
              role: { type: "string", enum: ["admin", "coach", "staff"] }
            }
          }
        }
      },
      CreateTournamentRequest: {
        type: "object",
        required: ["name", "season", "startDate", "endDate", "ageCategory"],
        properties: {
          name: { type: "string", example: "Torneo Primavera" },
          season: { type: "string", example: "2026" },
          location: { type: "string", example: "Milano" },
          startDate: { type: "string", format: "date-time", example: "2026-09-10T09:00:00.000Z" },
          endDate: { type: "string", format: "date-time", example: "2026-09-12T18:00:00.000Z" },
          ageCategory: { type: "string", example: "U12" }
        }
      },
      Tournament: {
        type: "object",
        properties: {
          _id: { type: "string" },
          name: { type: "string" },
          season: { type: "string" },
          location: { type: "string" },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
          ageCategory: { type: "string" },
          createdBy: { type: "string" }
        }
      }
    }
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    service: { type: "string", example: "MiniHoopsManager API" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterRequest" }
            }
          }
        },
        responses: {
          "201": {
            description: "User registered",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthResponse" }
              }
            }
          }
        }
      }
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" }
            }
          }
        },
        responses: {
          "200": {
            description: "Login successful",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthResponse" }
              }
            }
          }
        }
      }
    },
    "/api/tournaments": {
      get: {
        tags: ["Tournaments"],
        summary: "List tournaments",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Tournament list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tournaments: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Tournament" }
                    }
                  }
                }
              }
            }
          },
          "401": { description: "Unauthorized" }
        }
      },
      post: {
        tags: ["Tournaments"],
        summary: "Create a tournament",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateTournamentRequest" }
            }
          }
        },
        responses: {
          "201": {
            description: "Tournament created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "Tournament created" },
                    tournament: { $ref: "#/components/schemas/Tournament" }
                  }
                }
              }
            }
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" }
        }
      }
    }
  }
};
