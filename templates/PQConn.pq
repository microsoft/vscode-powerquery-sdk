// This file contains your Data Connector logic
[Version = "1.0.0"]
section {{ProjectName}};

[DataSource.Kind="{{ProjectName}}", Publish="{{ProjectName}}.Publish"]
shared {{ProjectName}}.Contents = (optional message as text) =>
    let
        _message = if (message <> null) then message else "(no message)",
        a = "Hello from {{ProjectName}}: " & _message
    in
        a;

// Data Source Kind description
{{ProjectName}} = [
    Authentication = [
        // Key = [],
        // UsernamePassword = [],
        // Windows = [],
        Anonymous = []
    ]
];

// Data Source UI publishing description
{{ProjectName}}.Publish = [
    Beta = true,
    Category = "Other",
    ButtonText = { Extension.LoadString("ButtonTitle"), Extension.LoadString("ButtonHelp") },
    LearnMoreUrl = "https://powerbi.microsoft.com/",
    SourceImage = {{ProjectName}}.Icons,
    SourceTypeImage = {{ProjectName}}.Icons
];

{{ProjectName}}.Icons = [
    Icon16 = { Extension.Contents("{{ProjectName}}16.png"), Extension.Contents("{{ProjectName}}20.png"), Extension.Contents("{{ProjectName}}24.png"), Extension.Contents("{{ProjectName}}32.png") },
    Icon32 = { Extension.Contents("{{ProjectName}}32.png"), Extension.Contents("{{ProjectName}}40.png"), Extension.Contents("{{ProjectName}}48.png"), Extension.Contents("{{ProjectName}}64.png") }
];
