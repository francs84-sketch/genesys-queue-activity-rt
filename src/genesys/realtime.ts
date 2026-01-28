import platformClient from "purecloud-platform-client-v2";

export function makeApi(accessToken: string) {
  const client = platformClient.ApiClient.instance;
  client.setEnvironment((import.meta as any).env.VITE_GC_REGION);
  client.setAccessToken(accessToken);

  return {
    notificationsApi: new platformClient.NotificationsApi(),
  };
}

export async function openChannelAndSubscribe(
  notificationsApi: any,
  queueIds: string[],
  onMessage: (topic: string, eventBody: any) => void
) {
  const channel = await notificationsApi.postNotificationsChannels();
  const ws = new WebSocket(channel.connectUri);

  const topics = queueIds.flatMap((id) => [
    { id: `v2.analytics.queues.${id}.observations` },
    { id: `v2.routing.queues.${id}.users` }, // per toggle lista agenti (puoi non usarlo subito)
  ]);

  await notificationsApi.postNotificationsChannelSubscriptions(channel.id, topics);

  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg?.topicName) onMessage(msg.topicName, msg.eventBody);
  };

  return { channelId: channel.id, ws };
}
