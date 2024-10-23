from __future__ import (absolute_import, division, print_function,
                        unicode_literals)
import backtrader as bt
from src.data.getdata import get_test_data

from src.strats.harmonic import Harmonic
from src.strats.example import TestStrategy
from src.strats.sma_cross import SmaCross

STRATEGY = SmaCross

OPTIMISE = True

if __name__ == '__main__':
    # Create a cerebro entity
    cerebro = bt.Cerebro()

    # Add a strategy
    if OPTIMISE:
        strats = cerebro.optstrategy(
            SmaCross,
            pfast=range(2, 15),
            pslow=range(6, 50))
    else:
        cerebro.addstrategy(STRATEGY)
    
    fetched_data = get_test_data(epic='CS.D.GBPUSD.CFD.IP')

    # Create a Data Feed
    # data = bt.feeds.PandasData(nocase=True, dataname=fetched_data, openinterest=None, datetime=None, open='open', close='close', high='high', low='low', volume='volume')
    data = bt.feeds.PandasData(dataname=fetched_data, datetime='datetime')

    # Add the Data Feed to Cerebro
    cerebro.adddata(data)

    # Set our desired cash start
    cerebro.broker.setcash(1000.0)

    # Add a FixedSize sizer according to the stake
    cerebro.addsizer(bt.sizers.PercentSizer, percents=50)

    # Set the commission
    cerebro.broker.setcommission(commission=0.0, leverage=30.0, margin=0.03)

    # Print out the starting conditions
    if not OPTIMISE:
        print('Starting Portfolio Value: %.2f' % cerebro.broker.getvalue())

    # Run over everything
    cerebro.run(maxcpus=4)

    if not OPTIMISE:
        # Print out the final result
        print('Final Portfolio Value: %.2f' % cerebro.broker.getvalue())
        # Plot the result
        cerebro.plot()
