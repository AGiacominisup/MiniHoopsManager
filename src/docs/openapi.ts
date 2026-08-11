export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "MiniHoopsManager API",
    version: "1.0.0",
    description: "API for managing youth mini-basket tournaments"
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
    { name: "Tournaments" },
    { name: "Players" },
    { name: "Registrations" },
    { name: "Matches" },
    { name: "Users" }
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
          password: { type: "string", minLength: 8, example: "superPassword123" }
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
        required: ["name", "startDate", "endDate"],
        properties: {
          name: { type: "string", example: "Spring Tournament" },
          startDate: { type: "string", format: "date-time", example: "2026-09-10T09:00:00.000Z" },
          endDate: { type: "string", format: "date-time", example: "2026-09-12T18:00:00.000Z" },
          category: { type: "string", example: "U12" },
          winPoints: { type: "integer", example: 10 },
          status: { type: "string", enum: ["planned", "in_progress", "completed"], example: "planned" },
          courts: {
            type: "array",
            items: {
              type: "object",
              required: ["name"],
              properties: {
                name: { type: "string", example: "Court 1" }
              }
            }
          },
          finalGroups: {
            type: "array",
            items: {
              type: "object",
              required: ["themeName", "level"],
              properties: {
                themeName: { type: "string", example: "Lakers" },
                level: { type: "integer", example: 1 }
              }
            }
          }
        }
      },
      Tournament: {
        type: "object",
        properties: {
          _id: { type: "string" },
          name: { type: "string" },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
          category: { type: "string" },
          winPoints: { type: "integer" },
          status: { type: "string", enum: ["planned", "in_progress", "completed"] },
          courts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                _id: { type: "string" },
                name: { type: "string" }
              }
            }
          },
          finalGroups: {
            type: "array",
            items: {
              type: "object",
              properties: {
                _id: { type: "string" },
                themeName: { type: "string" },
                level: { type: "integer" }
              }
            }
          }
        }
      },
      Player: {
        type: "object",
        properties: {
          _id: { type: "string" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          birthDate: { type: "string", format: "date-time" },
          guardianContact: { type: "string" }
        }
      },
      Registration: {
        type: "object",
        required: ["tournamentId", "playerId"],
        properties: {
          _id: { type: "string" },
          tournamentId: { type: "string" },
          playerId: { type: "string" },
          jerseyNumber: { type: "integer", minimum: 0 },
          rankingPoints: { type: "integer", minimum: 0 },
          matchesPlayed: { type: "integer", minimum: 0 },
          wins: { type: "integer", minimum: 0 },
          pointsScored: { type: "integer", minimum: 0 },
          pointsAllowed: { type: "integer", minimum: 0 },
          finalGroupId: { type: "string", nullable: true }
        }
      },
      Match: {
        type: "object",
        required: ["tournamentId", "courtId", "phase", "scheduledAt", "teams"],
        properties: {
          _id: { type: "string" },
          tournamentId: { type: "string" },
          courtId: { type: "string" },
          finalGroupId: { type: "string", nullable: true },
          phase: { type: "string", enum: ["qualification", "final"] },
          scheduledAt: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["scheduled", "in_progress", "completed"] },
          scoreA: { type: "integer", minimum: 0 },
          scoreB: { type: "integer", minimum: 0 },
          teams: {
            type: "array",
            minItems: 2,
            maxItems: 2,
            items: {
              type: "object",
              required: ["side", "players"],
              properties: {
                side: { type: "string", enum: ["A", "B"] },
                players: {
                  type: "array",
                  minItems: 3,
                  maxItems: 3,
                  items: {
                    type: "object",
                    required: ["registrationId"],
                    properties: {
                      registrationId: { type: "string" },
                      jerseyNumber: { type: "integer", minimum: 0 },
                      name: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ["admin", "coach", "staff"] }
        }
      },
      UserWriteRequest: {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          role: { type: "string", enum: ["admin", "coach", "staff"] }
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
    },
    "/api/tournaments/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: {
        tags: ["Tournaments"], summary: "Get a tournament", security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Tournament" }, "404": { description: "Not found" } }
      },
      patch: {
        tags: ["Tournaments"], summary: "Update a tournament", security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateTournamentRequest" } } } },
        responses: { "200": { description: "Tournament updated" }, "403": { description: "Forbidden" }, "404": { description: "Not found" } }
      },
      delete: {
        tags: ["Tournaments"], summary: "Delete a tournament", security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Tournament deleted" }, "409": { description: "Related resources exist" } }
      }
    },
    "/api/players": {
      get: {
        tags: ["Players"], summary: "List players", security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Player list" }, "401": { description: "Unauthorized" } }
      },
      post: {
        tags: ["Players"], summary: "Create a player", security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Player" } } } },
        responses: { "201": { description: "Player created" }, "403": { description: "Forbidden" } }
      }
    },
    "/api/players/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: {
        tags: ["Players"], summary: "Get a player", security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Player" }, "404": { description: "Not found" } }
      },
      patch: {
        tags: ["Players"], summary: "Update a player", security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Player" } } } },
        responses: { "200": { description: "Player updated" }, "403": { description: "Forbidden" } }
      },
      delete: {
        tags: ["Players"], summary: "Delete a player", security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Player deleted" }, "409": { description: "Related registrations exist" } }
      }
    },
    "/api/registrations": {
      get: {
        tags: ["Registrations"], summary: "List registrations", security: [{ bearerAuth: [] }],
        parameters: [
          { name: "tournamentId", in: "query", schema: { type: "string" } },
          { name: "playerId", in: "query", schema: { type: "string" } }
        ],
        responses: { "200": { description: "Registration list" } }
      },
      post: {
        tags: ["Registrations"], summary: "Create a registration", security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Registration" } } } },
        responses: { "201": { description: "Registration created" }, "409": { description: "Already registered" } }
      }
    },
    "/api/registrations/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: {
        tags: ["Registrations"], summary: "Get a registration", security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Registration" }, "404": { description: "Not found" } }
      },
      patch: {
        tags: ["Registrations"], summary: "Update a registration", security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Registration" } } } },
        responses: { "200": { description: "Registration updated" } }
      },
      delete: {
        tags: ["Registrations"], summary: "Delete a registration", security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Registration deleted" }, "409": { description: "Referenced by matches" } }
      }
    },
    "/api/matches": {
      get: {
        tags: ["Matches"], summary: "List matches", security: [{ bearerAuth: [] }],
        parameters: [
          { name: "tournamentId", in: "query", schema: { type: "string" } },
          { name: "phase", in: "query", schema: { type: "string", enum: ["qualification", "final"] } },
          { name: "status", in: "query", schema: { type: "string", enum: ["scheduled", "in_progress", "completed"] } }
        ],
        responses: { "200": { description: "Match list" } }
      },
      post: {
        tags: ["Matches"], summary: "Create a match", security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Match" } } } },
        responses: { "201": { description: "Match created" }, "400": { description: "Invalid references" } }
      }
    },
    "/api/matches/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: {
        tags: ["Matches"], summary: "Get a match", security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Match" }, "404": { description: "Not found" } }
      },
      patch: {
        tags: ["Matches"], summary: "Update a match", security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Match" } } } },
        responses: { "200": { description: "Match updated" }, "400": { description: "Invalid references" } }
      },
      delete: {
        tags: ["Matches"], summary: "Delete a match", security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Match deleted" }, "404": { description: "Not found" } }
      }
    },
    "/api/users": {
      get: {
        tags: ["Users"], summary: "List users (admin only)", security: [{ bearerAuth: [] }],
        responses: { "200": { description: "User list" }, "403": { description: "Forbidden" } }
      },
      post: {
        tags: ["Users"], summary: "Create a user (admin only)", security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/UserWriteRequest" } } } },
        responses: { "201": { description: "User created" }, "409": { description: "Email already in use" } }
      }
    },
    "/api/users/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: {
        tags: ["Users"], summary: "Get a user (admin only)", security: [{ bearerAuth: [] }],
        responses: { "200": { description: "User" }, "404": { description: "Not found" } }
      },
      patch: {
        tags: ["Users"], summary: "Update a user (admin only)", security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/UserWriteRequest" } } } },
        responses: { "200": { description: "User updated" }, "409": { description: "Email already in use" } }
      },
      delete: {
        tags: ["Users"], summary: "Delete a user (admin only)", security: [{ bearerAuth: [] }],
        responses: { "200": { description: "User deleted" }, "409": { description: "Cannot delete current user" } }
      }
    }
  }
};
