export interface CargoQueryPageId {
  cargoquery: {
    title: {
      PageID: string;
    };
  }[];
}

export interface ParseQueryPageContent {
  parse: {
    title: string;
    pageid: number;
    wikitext: {
      "*": string; 
    };
  };
}

export interface SaveLocationsObject {
  [key: string]: string;
}
