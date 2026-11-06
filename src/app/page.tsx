import { FollowedClaims } from "@/components/followed-claims";
import { FollowingManager } from "@/components/following-manager";
import { SinceLastVisit } from "@/components/since-last-visit";

export default function Home() {
  return (
    <>
      <SinceLastVisit />
      <FollowedClaims />
      <FollowingManager />
    </>
  );
}
