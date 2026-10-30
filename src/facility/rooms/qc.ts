import { P, rect, text } from "../pixels";
import { block, desk, plant, screen, tiles, type RoomArt } from "./kit";

/** A quiet inspection room: paper samples, a light table and a magnifier. */
export const qc: RoomArt = {
  icon: [
    "0000000",
    "0000010",
    "0000110",
    "1001100",
    "1111000",
    "0110000",
    "0000000",
  ],
  floor(ctx, s) {
    tiles(ctx, s.floor, 16, "#c3c7ad", "#bdc3a5");
  },
  wall(ctx, s) {
    rect(ctx, s.wall.x, s.wall.y, s.wall.w, s.wall.h, "#8e9c81");
    rect(ctx, s.wall.x, s.wall.y + 18, s.wall.w, 5, "#69765c");
  },
  furnish(ctx, s) {
    const f = s.floor;
    for (const station of s.rl.stations) {
      desk(ctx, station.x - 23, station.y - 24, 46, "#dbd4b7", "#a09b7c");
      screen(ctx, station.x - 17, station.y - 22, 24, 10, "#f7f3db");
      rect(ctx, station.x - 14, station.y - 20, 18, 1, "#b8c09f");
      rect(ctx, station.x - 14, station.y - 17, 13, 1, "#a5b18c");
      rect(ctx, station.x + 11, station.y - 22, 8, 8, P.brown);
      rect(ctx, station.x + 13, station.y - 20, 4, 4, "#d9e8d0");
      rect(ctx, station.x + 17, station.y - 14, 2, 5, P.darkBrown);
    }
    block(ctx, f.x + 9, f.y + f.h - 25, 38, 8, 10, {
      top: "#c7b48e",
      front: "#938160",
    });
    text(ctx, "SAMPLES", f.x + 11, f.y + f.h - 13, "#f5efd8");
    plant(ctx, f.x + f.w - 18, f.y + f.h - 20);
  },
};
