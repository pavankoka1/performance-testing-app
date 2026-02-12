import {
  getLatestVideo,
  getLiveMetrics,
  startRecording,
  stopRecording,
} from "@/lib/playwrightUtils";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecordRequest =
  | { action: "start"; url: string; cpuThrottle?: 1 | 4 | 6 }
  | { action: "stop" };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecordRequest;

    if (body.action === "start") {
      const cpuThrottle = body.cpuThrottle ?? 1;
      const status = await startRecording(body.url, cpuThrottle);
      return NextResponse.json({ status });
    }

    if (body.action === "stop") {
      const report = await stopRecording();
      return NextResponse.json({ report });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const video = searchParams.get("video") === "1";
  const metrics = searchParams.get("metrics") === "1";

  if (metrics) {
    try {
      const live = await getLiveMetrics();
      return NextResponse.json(live ?? { recording: false });
    } catch {
      return NextResponse.json({ recording: false });
    }
  }

  if (!video) {
    return NextResponse.json(
      { error: "Unsupported request." },
      { status: 400 }
    );
  }
  try {
    const videoData = await getLatestVideo();
    return new NextResponse(videoData.data, {
      headers: {
        "Content-Type": videoData.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Video not available.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
