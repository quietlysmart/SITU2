import { purgeUserByUidOrEmail } from "../functions/lib/purgeHelper.js";
import fs from "fs";
import { spawnSync } from "child_process";

function resolveProjectId() {
    if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
    if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;

    // Try .firebaserc
    try {
        const rc = JSON.parse(fs.readFileSync(".firebaserc", "utf8"));
        if (rc?.projects?.default) return rc.projects.default;
    } catch {
        // ignore
    }

    // Try firebase CLI
    const res = spawnSync("firebase", ["use", "--json"], { encoding: "utf8" });
    if (res.status === 0 && res.stdout) {
        try {
            const parsed = JSON.parse(res.stdout);
            if (parsed?.result) return parsed.result;
        } catch {
            // ignore parse error
        }
    }

    return null;
}

const uidOrEmail = process.argv[2];
const diagnose = process.argv.includes("--diagnose");

if (!uidOrEmail) {
    console.error("Usage: npm run purge-user -- <uidOrEmail>");
    process.exit(1);
}

const projectId = resolveProjectId();
if (projectId) {
    process.env.GCLOUD_PROJECT = projectId;
    console.log(`Using projectId: ${projectId}`);
} else {
    console.warn("Project ID not found. Set GCLOUD_PROJECT env var or configure .firebaserc.");
}

(async () => {
    try {
        if (diagnose) {
            process.env.PURGE_DIAGNOSE = "1";
        }
        const summary = await purgeUserByUidOrEmail(uidOrEmail, false);
        console.log(JSON.stringify(summary, null, 2));
        process.exit(0);
    } catch (err) {
        console.error("Purge failed:", err);
        process.exit(1);
    }
})();
