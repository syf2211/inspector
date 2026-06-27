import { exchangeAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import { oauthTransitions } from "../oauth-state-machine";
import type { AuthDebuggerState } from "../auth-types";

jest.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({
  exchangeAuthorization: jest.fn(),
}));

const mockExchangeAuthorization =
  exchangeAuthorization as jest.MockedFunction<typeof exchangeAuthorization>;

const baseMetadata = {
  issuer: "https://oauth.example.com",
  authorization_endpoint: "https://oauth.example.com/authorize",
  token_endpoint: "https://oauth.example.com/token",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  token_endpoint_auth_methods_supported: [
    "client_secret_post",
    "client_secret_basic",
    "none",
  ],
};

const confidentialClient = {
  client_id: "dcr_client_id",
  client_secret: "dcr_client_secret",
  token_endpoint_auth_method: "client_secret_post" as const,
};

describe("oauthTransitions.token_request", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExchangeAuthorization.mockResolvedValue({
      access_token: "access-token",
      token_type: "Bearer",
    });
  });

  it("uses oauthClientInfo from flow state when session storage has no client", async () => {
    const provider = {
      codeVerifier: () => "verifier",
      getServerMetadata: () => baseMetadata,
      clientInformation: async () => undefined,
      saveTokens: jest.fn(),
    };

    const state: AuthDebuggerState = {
      oauthStep: "token_request",
      authorizationCode: "auth-code",
      oauthClientInfo: confidentialClient,
      oauthMetadata: baseMetadata,
      resource: null,
      resourceMetadata: null,
      resourceMetadataError: null,
      authServerUrl: new URL("https://oauth.example.com"),
      authorizationUrl: null,
      oauthTokens: null,
      validationError: null,
      statusMessage: null,
      latestError: null,
      isInitiatingAuth: false,
    };

    const updateState = jest.fn();

    await oauthTransitions.token_request.execute({
      state,
      serverUrl: "https://example.com/mcp",
      provider: provider as never,
      updateState,
      fetchFn: undefined,
    });

    expect(mockExchangeAuthorization).toHaveBeenCalledWith(
      "https://example.com/mcp",
      expect.objectContaining({
        clientInformation: confidentialClient,
        authorizationCode: "auth-code",
        codeVerifier: "verifier",
      }),
    );
  });

  it("allows token_request when flow state has client info but session storage does not", async () => {
    const provider = {
      codeVerifier: () => "verifier",
      getServerMetadata: () => baseMetadata,
      clientInformation: async () => undefined,
      saveTokens: jest.fn(),
    };

    const state: AuthDebuggerState = {
      oauthStep: "token_request",
      authorizationCode: "auth-code",
      oauthClientInfo: confidentialClient,
      oauthMetadata: baseMetadata,
      resource: null,
      resourceMetadata: null,
      resourceMetadataError: null,
      authServerUrl: new URL("https://oauth.example.com"),
      authorizationUrl: null,
      oauthTokens: null,
      validationError: null,
      statusMessage: null,
      latestError: null,
      isInitiatingAuth: false,
    };

    const canProceed = await oauthTransitions.token_request.canTransition({
      state,
      serverUrl: "https://example.com/mcp",
      provider: provider as never,
      updateState: jest.fn(),
    });

    expect(canProceed).toBe(true);
  });
});
