"use client";

import { Button } from "@/components/ui/button";


export function DeleteResume({ id, name }: { id: string; name: string }) {
  return <form action="/api/workspace/delete-resume" method="post" onSubmit={event => {
    if (!window.confirm(`Delete "${name}" and its extraction review records? This permanently removes the stored file. Your profile remains available.`)) event.preventDefault();
  }}>
    <input type="hidden" name="resumeId" value={id} />
    <Button className="button secondary compact" type="submit">Delete resume</Button>
  </form>;
}
