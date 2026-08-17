import { PlannerOutput, plannerOutputSchema } from "@/lib/llm/types";
import { CreateBacklogButton } from "./CreateBacklogButton";

type AgentRunProps = {
  id: string;
  agentName: string | null;
  model: string | null;
  status: string;
  input: string | null;
  output: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
};

const STATUS_TONES: Record<string, string> = {
  queued: "bg-neutral-700/40 text-neutral-300",
  running: "bg-sky-500/15 text-sky-300",
  completed: "bg-emerald-500/15 text-emerald-300",
  completed_with_warnings: "bg-amber-500/15 text-amber-300",
  failed: "bg-red-500/15 text-red-300",
  cancelled: "bg-neutral-700/40 text-neutral-400",
};

function parsePlannerOutput(output: string | null): PlannerOutput | null {
  if (!output) return null;
  try {
    const parsed = plannerOutputSchema.safeParse(JSON.parse(output));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-text-dim">
        {title}
      </h4>
      <div className="mt-1 text-neutral-200">{children}</div>
    </div>
  );
}

export function AgentRunCard({
  run,
  taskCount = 0,
}: {
  run: AgentRunProps;
  taskCount?: number;
}) {
  const plan = parsePlannerOutput(run.output);
  const tone = STATUS_TONES[run.status] ?? "bg-neutral-700/40 text-neutral-300";

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-neutral-200">
          {run.agentName ?? "agent"}
        </span>
        <span className="text-text-dim">· {run.model ?? "model"}</span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
        >
          {run.status}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-dim">
        {run.startedAt ? <span>Started {run.startedAt.toLocaleString()}</span> : null}
        {run.finishedAt ? (
          <span>Finished {run.finishedAt.toLocaleString()}</span>
        ) : null}
      </div>

      {plan && plan.proposed_tasks.length > 0 ? (
        <CreateBacklogButton
          agentRunId={run.id}
          alreadyCreated={taskCount > 0}
        />
      ) : null}

      {plan ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-accent hover:underline">
            View plan
          </summary>
          <div className="mt-3 flex flex-col gap-3 text-sm">
            <Section title="Summary">
              <p className="whitespace-pre-wrap">{plan.summary}</p>
            </Section>

            <Section title="Recommended next phase">
              <p>{plan.recommended_next_phase}</p>
            </Section>

            {plan.objectives.length > 0 ? (
              <Section title="Objectives">
                <ul className="list-disc space-y-1 pl-5">
                  {plan.objectives.map((objective, i) => (
                    <li key={i}>{objective}</li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {plan.proposed_tasks.length > 0 ? (
              <Section title="Proposed tasks">
                <ul className="space-y-2">
                  {plan.proposed_tasks.map((task, i) => (
                    <li
                      key={i}
                      className="rounded-md bg-surface p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-neutral-100">
                          {task.title}
                        </span>
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-dim">
                          {task.type}
                        </span>
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-dim">
                          {task.priority}
                        </span>
                      </div>
                      <p className="mt-1 text-neutral-300">{task.description}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {plan.risks.length > 0 ? (
              <Section title="Risks">
                <ul className="list-disc space-y-1 pl-5">
                  {plan.risks.map((risk, i) => (
                    <li key={i}>{risk}</li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {plan.questions.length > 0 ? (
              <Section title="Questions">
                <ul className="list-disc space-y-1 pl-5">
                  {plan.questions.map((question, i) => (
                    <li key={i}>{question}</li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {plan.acceptance_criteria.length > 0 ? (
              <Section title="Acceptance criteria">
                <ul className="list-disc space-y-1 pl-5">
                  {plan.acceptance_criteria.map((criteria, i) => (
                    <li key={i}>{criteria}</li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>
        </details>
      ) : run.output ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-accent hover:underline">
            View raw output
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 text-xs text-neutral-300">
            {run.output}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
