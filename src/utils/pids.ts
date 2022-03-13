import * as process from "process";

/**
 * Will throw an error if target does not exist, and as a special case, a signal
 * of 0 can be used to test for the existence of a process
 * @param pid: number
 */
export function pidIsRunning(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return false;
    }
}
