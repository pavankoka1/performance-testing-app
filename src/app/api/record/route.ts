import { NextResponse } from "next/server";
import { startRecording, stopRecording } from "@/lib/playwrightUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecordRequest =
  | { action: "start"; url: string }
  | { action: "stop" };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecordRequest;

    if (body.action === "start") {
      const status = await startRecording(body.url);
      return NextResponse.json({ status });
    }

    if (body.action === "stop") {
      const report = await stopRecording();
      return NextResponse.json({ report });
    }

    return NextResponse.json(
      { error: "Unsupported action." },
      { status: 400 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
