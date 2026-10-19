export function demo(variant='broken'){
  const cells=[];
  const add=(address,value,formula='',kind='number')=>cells.push({sheet:'项目报价',address,value:String(value),formula,kind});
  ['项目','分类','单位','数量','单价','金额'].forEach((v,i)=>add(String.fromCharCode(65+i)+'2',v,'','text'));
  const names=['调研访谈','原型设计','视觉设计','前端页面','交互联调','数据接入','兼容测试','文档交付','培训支持'];
  for(let row=3;row<=11;row++){
    add('A'+row,names[row-3],'','text');add('B'+row,'服务','','text');add('C'+row,'项','','text');
    add('D'+row,row-1);add('E'+row,(row+2)*100);
    let formula=`=D${row}*E${row}`;
    if(row===7&&variant==='broken')formula='=D7*E6';
    if(row===7&&variant==='exception')formula='=D7*E7*0.9';
    const cached=(row-1)*(row===7&&variant==='broken'?(row+1)*100:(row+2)*100)*(row===7&&variant==='exception'?0.9:1);
    if(row===7&&variant==='overwritten')add('F7',4800);else add('F'+row,cached,formula);
  }
  const subtotal=cells.filter(c=>/^F\d+$/.test(c.address)&&c.kind==='number').reduce((n,c)=>n+Number(c.value),0);
  add('A13','小计','','text');add('F13',subtotal,'=SUM(F3:F11)');
  add('A14','含税总计','','text');add('F14',subtotal*1.06,'=F13*1.06');
  const labels={broken:'错误引用',clean:'正常对照',exception:'折扣例外',overwritten:'公式被覆盖'};
  return {schema:'mooncell.workbook.v1',name:'演示报价表 · '+labels[variant],cells,sheets:['项目报价'],warnings:['合成演示数据；不代表真实客户或实际发现的错误。表格显示输入缓存值，影响预览会重新计算。']};
}
