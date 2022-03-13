import { sep } from "path";

export function formatPath(base: string, dirname: string, basename: string) {
    return [base, dirname === "." ? "" : dirname, basename].filter(Boolean).join(sep);
}

export function joinPath(...args: string[]) {
    return args.slice().filter(Boolean).join(sep);
}
