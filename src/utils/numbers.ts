export function covertStringToInteger(str: string): number | undefined {
    const oneNum: number = Number.parseInt(str, 10);
    if (Number.isInteger(oneNum)) {
        return oneNum;
    }
    return undefined;
}
