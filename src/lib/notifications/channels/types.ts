// Area 09 §14 Channel Adapter Contract — verbatim shape from the spec,
// typed. `validateDestination` is a cheap sanity check (not full RFC
// validation) used before even queuing a delivery; `send` is the actual
// provider call.
export type ChannelSendInput = {
  notificationId: string;
  destination: string;
  title: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
};

export type ChannelSendResult = {
  accepted: boolean;
  providerMessageId?: string;
  retryable?: boolean;
  errorCode?: string;
  errorMessage?: string;
};

export interface NotificationChannelAdapter {
  channel: string;
  validateDestination(destination: string): boolean;
  send(input: ChannelSendInput): Promise<ChannelSendResult>;
}
