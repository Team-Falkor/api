export interface IGetSchemaForGame {
  game: Game;
}

export interface Game {
  gameName: string;
  gameVersion: string;
  availableGameStats: AvailableGameStats;
}

export interface AvailableGameStats {
  achievements: Achievement[];
}

export interface Achievement {
  name: string;
  defaultvalue: number;
  displayName: string;
  hidden: number;
  icon: string;
  icongray: string;
  description?: string;
}
