from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

import backtrader as bt

class SmaCross(bt.Strategy):
    params = (
        ('pfast', 2),
        ('pslow', 5),
    )

    def log(self, txt, dt=None):
        ''' Logging function for this strategy'''
        dt = dt or self.datas[0].datetime.date(0)
        print('%s, %s' % (dt.isoformat(), txt))

    def __init__(self):
        sma1 = bt.ind.SMA(period=self.p.pfast)
        sma2 = bt.ind.SMA(period=self.p.pslow)
        self.crossover = bt.ind.CrossOver(sma1, sma2)

    def next(self):
        if self.crossover > 0:
            self.buy()
        elif self.crossover < 0:
            self.sell()

    def stop(self):
        self.log('(MA Fast Period %2d) (MA Slow Period %2d) Ending Value %.2f' %
                 (self.params.pfast, self.params.pslow, self.broker.getvalue()))
