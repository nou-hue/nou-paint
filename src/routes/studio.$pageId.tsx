import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Studio } from "@/components/Studio";

export const Route = createFileRoute("/studio/$pageId")({
  component: StudioRoute,
});

function StudioRoute() {
  const { pageId } = Route.useParams();
  const [upload, setUpload] = useState<string | null>(null);

  useEffect(() => {
    if (pageId === "upload") {
      setUpload(sessionStorage.getItem("nou-upload"));
    }
  }, [pageId]);

  return <Studio pageId={pageId} uploadSrc={upload} />;
}
