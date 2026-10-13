// Maintainer helper. Git's configured credential manager supplies authorization
// in process memory only; credentials are never written or printed.
import { spawnSync } from "node:child_process";
const repository = "skippzz/Mase";
const credential = spawnSync("git", ["credential", "fill"], {
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf8",
  windowsHide: true,
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" },
});
if (credential.status !== 0)
  throw new Error(
    "GitHub credentials are unavailable in the configured Git credential manager.",
  );
const token = credential.stdout
  .split("\n")
  .find((line) => line.startsWith("password="))
  ?.slice(9);
if (!token)
  throw new Error("Git credential manager returned no GitHub credential.");
async function api(path, method = "GET", body) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const data = response.status === 204 ? {} : await response.json();
  return { response, data };
}
const args = process.argv.slice(2);
let pages = await api("pages");
if (args.includes("--enable-pages")) {
  if (pages.response.status === 404)
    pages = await api("pages", "POST", { build_type: "workflow" });
  else if (pages.response.ok && pages.data.build_type !== "workflow")
    pages = await api("pages", "PUT", { build_type: "workflow" });
}
console.log(
  JSON.stringify({
    pages: {
      http: pages.response.status,
      url: pages.data.html_url,
      status: pages.data.status,
      buildType: pages.data.build_type,
      message: pages.response.ok ? undefined : pages.data.message,
    },
  }),
);
const runs = await api("actions/runs?per_page=3");
console.log(
  JSON.stringify({
    runs: runs.response.ok
      ? runs.data.workflow_runs.map((run) => ({
          id: run.id,
          name: run.name,
          status: run.status,
          conclusion: run.conclusion,
          url: run.html_url,
          sha: run.head_sha,
        }))
      : { http: runs.response.status, message: runs.data.message },
  }),
);
const jobFlag = args.find((a) => a.startsWith("--jobs="));
if (jobFlag) {
  const jobs = await api(`actions/runs/${Number(jobFlag.slice(7))}/jobs`);
  console.log(
    JSON.stringify({
      jobs: jobs.data.jobs?.map((job) => ({
        id: job.id,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        steps: job.steps.map((step) => ({
          name: step.name,
          status: step.status,
          conclusion: step.conclusion,
        })),
      })),
    }),
  );
}
