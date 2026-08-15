type Activity = {
  id: string;
  type: string;
  message: string;
  createdAt: Date;
};

export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return <p className="text-sm text-text-dim">No activity yet.</p>;
  }

  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {activities.map((activity) => (
        <li key={activity.id} className="relative">
          <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-accent" />
          <div className="text-sm text-neutral-200">{activity.message}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-dim">
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">
              {activity.type}
            </span>
            <span>{activity.createdAt.toLocaleString()}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
