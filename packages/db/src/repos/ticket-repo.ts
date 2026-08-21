import { TicketModel, type TicketDoc } from '../models.js';

export type Ticket = Omit<TicketDoc, 'created_at' | 'updated_at'> & {
  _id: string | { toString(): string };
  created_at: Date;
  updated_at: Date;
};

export async function listTickets(guildId: string, limit = 50): Promise<Ticket[]> {
  const docs = await TicketModel.find({ guild_id: guildId })
    .sort({ created_at: -1 })
    .limit(limit)
    .lean();
  return docs as Ticket[];
}

export async function getOpenTicketByUser(guildId: string, userId: string): Promise<Ticket | null> {
  const doc = await TicketModel.findOne({ guild_id: guildId, user_id: userId, status: 'open' }).lean();
  return (doc as Ticket) ?? null;
}

export async function getTicketByChannel(channelId: string): Promise<Ticket | null> {
  const doc = await TicketModel.findOne({ channel_id: channelId }).lean();
  return (doc as Ticket) ?? null;
}

export async function getTicket(guildId: string, id: string): Promise<Ticket | null> {
  const doc = await TicketModel.findOne({ guild_id: guildId, _id: id }).lean();
  return (doc as Ticket) ?? null;
}

export async function createTicket(
  guildId: string,
  userId: string,
  channelId: string,
  reason: string,
): Promise<Ticket> {
  const doc = await TicketModel.create({
    guild_id: guildId,
    user_id: userId,
    channel_id: channelId,
    status: 'open',
    reason,
  });
  return doc.toObject() as Ticket;
}

export async function closeTicket(channelId: string): Promise<Ticket | null> {
  const doc = await TicketModel.findOneAndUpdate(
    { channel_id: channelId, status: 'open' },
    { $set: { status: 'closed', closed_at: new Date() } },
    { new: true },
  ).lean();
  return (doc as Ticket) ?? null;
}

export async function closeTicketById(ticketId: string): Promise<Ticket | null> {
  const doc = await TicketModel.findOneAndUpdate(
    { _id: ticketId, status: 'open' },
    { $set: { status: 'closed', closed_at: new Date() } },
    { new: true },
  ).lean();
  return (doc as Ticket) ?? null;
}

export async function assignTicket(channelId: string, userId: string): Promise<Ticket | null> {
  const doc = await TicketModel.findOneAndUpdate(
    { channel_id: channelId, status: 'open' },
    { $set: { assigned_to: userId } },
    { new: true },
  ).lean();
  return (doc as Ticket) ?? null;
}

export async function countOpenTickets(guildId: string): Promise<number> {
  return TicketModel.countDocuments({ guild_id: guildId, status: 'open' });
}
