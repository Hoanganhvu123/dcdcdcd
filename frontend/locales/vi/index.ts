import { ChatVi } from './chat';
import { CommonVi } from './common';
import { FlowVi } from './flow';

const vi = {
  ...ChatVi,
  ...FlowVi,
  ...CommonVi,
};

export default vi;
