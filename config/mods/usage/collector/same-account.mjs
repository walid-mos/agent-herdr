const freshestFirst = (a, b) => (Date.parse(b.readAt) || 0) - (Date.parse(a.readAt) || 0);

function mergeGroup(group) {
  const [freshest] = [...group].sort(freshestFirst);
  const named = group.find((subscription) => subscription.plan) ?? freshest;
  const also = group.filter((subscription) => subscription !== named).map((subscription) => subscription.user).filter(Boolean);
  return { ...freshest, name: named.name, plan: named.plan, user: named.user, until: named.until ?? freshest.until, also };
}

export async function mergeSameAccount(subscriptions, accountOf) {
  const accounts = await Promise.all(subscriptions.map(accountOf));
  const groups = new Map();
  subscriptions.forEach((subscription, index) => {
    const key = accounts[index] ? `${subscription.provider}:${accounts[index]}` : `entry:${index}`;
    groups.set(key, [...(groups.get(key) ?? []), subscription]);
  });
  return [...groups.values()].map(mergeGroup);
}
