import { cookies } from "next/headers";
import { DEFAULT_TIME_ZONE, TIME_ZONE_COOKIE, isValidTimeZone } from "@/lib/time-zone";

function decodeTimeZone(value?: string) {
  if (!value) return null;

  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export async function getUserTimeZone() {
  const cookieStore = await cookies();
  const timeZone = decodeTimeZone(cookieStore.get(TIME_ZONE_COOKIE)?.value);

  return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}
