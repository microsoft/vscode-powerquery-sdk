[Version = "1.0.0"]
section MultipleAuthKindConnector;

[DataSource.Kind="MultipleAuthKindConnector"]
shared MultipleAuthKindConnector.Contents = () => Extension.CurrentCredential()[AuthenticationKind];

MultipleAuthKindConnector = [
    Authentication = [
        Key = [],
        UsernamePassword = [],
        Windows = [],
        Anonymous = []
    ]
];
