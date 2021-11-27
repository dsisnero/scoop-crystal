const fs = require("fs").promises;
const crypto = require("crypto");
const https = require("https");

async function main({github, core}) {
    const [owner, repo] = ["crystal-lang", "crystal"];

    const {data: {workflow_runs}} = await github.rest.actions.listWorkflowRuns({
        owner, repo, workflow_id: "win.yml", branch: "master", event: "push", status: "success", per_page: 1,
    });
    if (!workflow_runs.length) {
        core.error("No workflow runs found");
        return;
    }
    const [{id: run_id, head_sha}] = workflow_runs;

    const {data: {artifacts}} = await github.rest.actions.listWorkflowRunArtifacts({
        owner, repo, run_id,
    });
    const artifact = artifacts.find((x) => x.name === "crystal");
    if (!artifact) {
        core.error("No 'crystal' artifact found");
        return;
    }

    const urls = [
        `https://github.com/crystal-lang/crystal/archive/${head_sha}.zip`,
        `https://nightly.link/crystal-lang/crystal/actions/artifacts/${artifact.id}.zip`,
    ];

    const data = JSON.parse(await fs.readFile("bucket/crystal.json", "utf8"));
    const new_nightly_version = parseInt(data["version"].slice(-1)) + 1;
    data["version"] = data["version"].slice(0, -1) + new_nightly_version;
    data["description"] = `Crystal programming language preview @ ${head_sha.slice(0, 9)}`;
    data["pre_install"] = [`mv $dir\\crystal-${head_sha} $dir\\crystal-lang`];
    data["url"] = urls.concat(data["url"].slice(2));

    if (data["hash"]) {
        const hashes = await Promise.all(urls.map(hash_url));
        data["hash"] = hashes.concat(data["hash"].slice(2));
    }

    await fs.writeFile("bucket/crystal.json", JSON.stringify(data, null, 4) + "\n", "utf8");
}


function hash_url(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            const hash = crypto.createHash("sha256");
            response.on("error", reject);
            response.on("data", (chunk) => hash.update(chunk));
            response.on("end", () => resolve(hash.digest("hex").toUpperCase()));
        });
    });
}

module.exports = main;

if (require.main === module) {
    const {Octokit} = require("@octokit/rest");
    const github = new Octokit({auth: process.env["GITHUB_TOKEN"]});
    const core = require("@actions/core");
    main({github, core});
}
