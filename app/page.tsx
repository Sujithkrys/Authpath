import { LibraryView } from "@/components/library-view";
import { getLibraryGuides } from "@/lib/guides";

export default function LibraryPage() {
  return <LibraryView guides={getLibraryGuides()} />;
}
