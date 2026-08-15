// hands the editor permission to upload one picture or GIF for the middle of an
// announcement body.
//
// THE FILE NEVER COMES THROUGH HERE. It goes from the browser straight to the
// blob store, and this route only says yes and under what terms - because a
// request body through our own server is capped at 4.5MB, and a GIF worth
// posting is regularly bigger than that. What we get back at the end is a url.
//
// So the terms are the whole job: where it may be written, what type it may be,
// and how big. All three are pinned into the client token, which is good for an
// hour and no use for anything else.
//
// upload-only by design. everything an announcement shows is in our own bucket,
// so nothing rots when somebody's giphy link goes away and no outside host gets
// a ping from every staff member who opens the post.
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { getCurrentUser } from "@/lib/current-user";
import { isSupervisorUp } from "@/lib/roles";
import { blobToken, hasBlobStorage } from "@/lib/blob";
import {
  INLINE_IMAGE_ACCEPT,
  INLINE_IMAGE_MAX_BYTES,
  isInlineImageKey,
} from "@/lib/announcement-images";

export const dynamic = "force-dynamic";

export async function POST(req) {
  // the same gate as the page holding the editor: only Supervisor+ writes a
  // post, so only Supervisor+ gets to write to the bucket.
  const user = await getCurrentUser();
  if (!user || !isSupervisorUp(user.role)) {
    return NextResponse.json(
      { error: "You dont have permission to do that." },
      { status: 403 },
    );
  }

  if (!hasBlobStorage()) {
    return NextResponse.json(
      { error: "Image upload isnt configured yet. Create a Blob store in Vercel." },
      { status: 503 },
    );
  }

  let body = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request: req,
      // pin the store token rather than letting the sdk pick OIDC. see lib/blob.
      token: blobToken(),
      onBeforeGenerateToken: async (pathname) => {
        // the browser picked this name, so it is checked, not trusted.
        if (!isInlineImageKey(pathname)) {
          throw new Error("That isnt a name an announcement image may have.");
        }
        return {
          allowedContentTypes: INLINE_IMAGE_ACCEPT,
          maximumSizeInBytes: INLINE_IMAGE_MAX_BYTES,
          // the key already carries a timestamp and a random tail
          addRandomSuffix: false,
        };
      },
      // no onUploadCompleted on purpose: the editor gets the url back from the
      // upload itself and puts it in the post, so there is nothing for a
      // callback to do - and asking for one would mean vercel calling a url that
      // doesn't exist while somebody is running this on localhost.
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "That upload didnt go through. Try again." },
      { status: 400 },
    );
  }
}
