export interface Challenge {
  id: number;
  date: string;
  targetExpressions: string[];
  graphData: {
    xRange?: [number, number];
    yRange?: [number, number];
  };
}
