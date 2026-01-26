import { notFound } from 'next/navigation';
import fs from 'fs/promises';
import path from 'path';
import RoomDetailClient from './RoomDetailClient';
import { getRoomSlug } from '@/lib/local-calendar';

interface Room {
  name: string;
  slug?: string;
  calendarId?: string;
  capacity: number;
  hourlyCost?: number;
  location: string;
  furniture?: string;
  image?: string;
  thumbnail?: string;
}

interface Settings {
  rooms: Room[];
}

// Load settings to get room list
async function loadSettings(): Promise<Settings> {
  try {
    const settingsPath = path.join(process.cwd(), 'settings.json');
    const content = await fs.readFile(settingsPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { rooms: [] };
  }
}

// Generate static params for all rooms
export async function generateStaticParams() {
  const settings = await loadSettings();
  return settings.rooms.map((room) => ({
    roomSlug: room.slug || getRoomSlug(room.name),
  }));
}

// Generate metadata for the page
export async function generateMetadata({ params }: { params: Promise<{ roomSlug: string }> }) {
  const { roomSlug } = await params;
  const settings = await loadSettings();
  const room = settings.rooms.find((r) => (r.slug || getRoomSlug(r.name)) === roomSlug);

  if (!room) {
    return { title: 'Room Not Found' };
  }

  return {
    title: `${room.name} | Open Source Village`,
    description: `${room.name} - ${room.location}. Capacity: ${room.capacity} people.`,
  };
}

export default async function RoomDetailPage({ params }: { params: Promise<{ roomSlug: string }> }) {
  const { roomSlug } = await params;
  const settings = await loadSettings();
  const room = settings.rooms.find((r) => (r.slug || getRoomSlug(r.name)) === roomSlug);

  if (!room) {
    notFound();
  }

  // Convert to RoomInfo format for the client component
  const roomInfo = {
    id: room.slug || getRoomSlug(room.name),
    name: room.name,
    capacity: room.capacity,
    hourlyCost: room.hourlyCost,
    location: room.location,
    furniture: room.furniture,
    image: room.image,
    thumbnail: room.thumbnail,
  };

  return <RoomDetailClient room={roomInfo} />;
}
