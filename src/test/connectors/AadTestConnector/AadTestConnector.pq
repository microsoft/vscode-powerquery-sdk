[Version = "1.0.0"]
section AadTestConnector;

[DataSource.Kind = "AadTestConnector"]
shared AadTestConnector.Contents = () =>
    let
        currentCredential = Extension.CurrentCredential(),
        access_token = currentCredential[access_token],
        expires = currentCredential[expires],
        tokenTtl = GetTokenTtl(access_token)
    in
        #table(
            {"HasRefreshToken", "expires", "tokenTtl"},
            {{currentCredential[refresh_token]? <> null, expires, Duration.ToText(tokenTtl)}}
        );

DecodeBase64Url = (string as text) as binary =>
    Binary.FromText(
        Text.Replace(Text.Replace(string, "-", "+"), "_", "/") & {"", "", "==", "="}{Number.Mod(Text.Length(string), 4)},
        BinaryEncoding.Base64
    );

DateTimeFromUnixTimeStamp = (timestamp as number) as datetimezone =>
    #datetimezone(1970, 1, 1, 0, 0, 0, 0, 0) + #duration(0, 0, 0, timestamp);

GetTokenTtl = (token as text) as duration =>
    let
        payloadEncoded = Text.Split(token, "."){1},
        payload = Json.Document(Text.FromBinary(DecodeBase64Url(payloadEncoded))),
        expires = DateTimeFromUnixTimeStamp(payload[exp])
    in
        expires - DateTimeZone.UtcNow();

AadTestConnector = [
    Authentication = [
        Aad = [
            AuthorizationUri = "https://login.microsoftonline.com/common/oauth2/authorize",
            Resource = "https://powerquery.microsoft.com"
        ]
    ]
];
