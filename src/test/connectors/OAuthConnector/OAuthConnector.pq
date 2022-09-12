[Version = "1.0.0"]
section OAuthConnector;

// Manually implements the Azure AD OAuth flow.
// https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow
// Useful for testing purposes only - connectors should use the 'Aad' authentication kind instead.

AuthorizeUri = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
TokenUri = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
RedirectUri = "https://preview.powerbi.com/views/oauthredirect.html";
LogoutUri = "https://login.microsoftonline.com/logout.srf";
Resource = "https://powerquery.microsoft.com";
Scope = Resource & "/user_impersonation offline_access";
ClientId = "a672d62c-fc7b-4e81-a576-e60dc46e951d";
windowWidth = 1024;
windowHeight = 720;

[DataSource.Kind="OAuthConnector"]
shared OAuthConnector.Contents = (optional message as text) =>
    let
        currentCredential = Extension.CurrentCredential(),
        access_token = currentCredential[access_token],
        expires = currentCredential[expires]
    in
        #table(
            {"HasRefreshToken", "expires"},
            {{currentCredential[refresh_token]? <> null, expires}}
        );

OAuthConnector = [
    Authentication = [
        OAuth = [
            StartLogin = StartLogin,
            FinishLogin = FinishLogin,
            Refresh = Refresh,
            Logout = Logout
        ]
    ]
];

StartLogin = (dataSourcePath, state, display) =>
    let
        codeVerifier = Text.NewGuid() & Text.NewGuid(),
        authorizeUrl = AuthorizeUri & "?" & Uri.BuildQueryString([
            client_id = ClientId,
            state = state,
            scope = Scope,
            response_type = "code",
            response_mode = "query",
            code_challenge_method = "plain",
            code_challenge = codeVerifier,
            redirect_uri = RedirectUri
        ])
    in
        [
            LoginUri = authorizeUrl,
            CallbackUri = RedirectUri,
            WindowHeight = windowHeight,
            WindowWidth = windowWidth,
            Context = codeVerifier
        ];

TokenMethod = (grantType, code, optional verifier) =>
    let
        codeVerifier = if (verifier <> null) then [code_verifier = verifier] else [],
        codeParameter = if (grantType = "authorization_code") then [ code = code ] else [ refresh_token = code ],
        requestBody = codeParameter & codeVerifier & [
            client_id = ClientId,
            scope = Scope,
            grant_type = grantType,
            redirect_uri = RedirectUri
        ],
        tokenResponse = Web.Contents(TokenUri, [
            Content = Text.ToBinary(Uri.BuildQueryString(requestBody)),
            Headers = [
                #"Content-type" = "application/x-www-form-urlencoded",
                #"Accept" = "application/json"
            ],
            ManualStatusHandling = {400, 401} 
        ]),
        body = Json.Document(tokenResponse)
    in
        if (Record.HasFields(body, {"error", "error_description"})) then 
            error Error.Record(body[error], body[error_description], body)
        else
            body;

FinishLogin = (context, callbackUri, state) =>
    let
        parts = Uri.Parts(callbackUri)[Query]
    in
        if (Record.HasFields(parts, {"error", "error_description"})) then 
            error Error.Record(parts[error], parts[error_description], parts)
        else
            TokenMethod("authorization_code", parts[code], context);

Refresh = (resourceUrl, refresh_token) => TokenMethod("refresh_token", refresh_token);

Logout = (token) => LogoutUri;