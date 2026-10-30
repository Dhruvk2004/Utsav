import { firebaseWebConfig, publicEnv } from "@/lib/config";
import { todayInIndia } from "@/lib/domain/dates";
import { loadGoogleSignIn } from "@/lib/firebase/client";
import type { AuthClient } from "./authClient";
import type { EventsRepository } from "./eventsRepository";
import { FirebaseAuthClient } from "./firebaseAuthClient";
import { HttpEventsRepository, HttpProfileStore } from "./httpStores";
import type { ProfileStore } from "./profileStore";
import { HttpWorkspaceRepository, type WorkspaceRepository } from "./workspaces";

/** The data interfaces client components use, supplied by `<ServicesProvider>`. */
export interface Services {
  auth: AuthClient;
  profiles: ProfileStore;
  events: EventsRepository;
  workspaces: WorkspaceRepository;
}

/** The app's services: the JSON API for data and the Firebase web SDK (loaded on demand) for sign-in. */
export function createHttpServices(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">): Services {
  const config = firebaseWebConfig(publicEnv());
  const loadSdk = () => (config ? loadGoogleSignIn(config) : Promise.reject(new Error("Sign-in isn't configured on this deployment.")));
  return {
    auth: new FirebaseAuthClient(loadSdk, storage),
    profiles: new HttpProfileStore(),
    events: new HttpEventsRepository(),
    workspaces: new HttpWorkspaceRepository(todayInIndia),
  };
}
