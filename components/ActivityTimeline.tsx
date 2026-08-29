type Activity = {
  id: string;
  type: string;
  message: string;
  createdAt: Date;
};

export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return <p className="text-sm text-m3-on-surface-variant">No activity yet.</p>;
  }

  return (
    <ol className="relative space-y-4 border-l border-m3-outline-variant pl-5">
      {activities.map((activity) => (
        <li key={activity.id} className="relative">
          <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-m3-primary" />
          <div className="text-sm text-m3-on-surface">{activity.message}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-m3-on-surface-variant">
            <span className="rounded bg-m3-surface-container-high px-1.5 py-0.5 font-mono">
              {activity.type}
            </span>
            <span>{activity.createdAt.toLocaleString()}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
