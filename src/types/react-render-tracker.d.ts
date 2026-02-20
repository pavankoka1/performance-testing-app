declare module "react-render-tracker/headless-browser-client" {
  import type { Page } from "playwright";
  type RrtClient = {
    getEvents: (offset?: number, limit?: number) => Promise<unknown[]>;
    getEventCount: () => Promise<number>;
  };
  function newTrackerClient(page: Page): Promise<RrtClient>;
  export default newTrackerClient;
}
