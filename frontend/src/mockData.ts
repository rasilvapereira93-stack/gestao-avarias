export type Machine = {
  id: string;
  number: string; // número gravado na máquina
  name?: string;
};

export type Line = {
  id: string;
  name: string;
  machines: Machine[];
};

export const lines: Line[] = [
  {
    id: "L1",
    name: "Linha 1",
    machines: [
      { id: "L1-M1", number: "01", name: "Máquina 01" },
      { id: "L1-M2", number: "02", name: "Máquina 02" },
      { id: "L1-E1", number: "E1", name: "Embaladeira" }
    ]
  },
  {
    id: "L2",
    name: "Linha 2",
    machines: [
      { id: "L2-M1", number: "10", name: "Máquina 10" },
      { id: "L2-M2", number: "11", name: "Máquina 11" },
      { id: "L2-E1", number: "E1", name: "Embaladeira" }
    ]
  }
];
