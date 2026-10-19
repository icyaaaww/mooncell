import {dispatch} from './core.mjs';
export function core(request){
  const result=JSON.parse(dispatch(JSON.stringify(request)));
  if(!result.ok)throw new Error(result.message);
  return result.data;
}
