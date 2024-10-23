import backtrader as bt
from src.strats.harmonic_src.harmonic_functions import HarmonicDetector
import pandas as pd
import backtrader as bt
from src.data.getdata import get_test_data
import numpy as np

PRECISION = 5
ERROR_MARGIN=0.5

def get_patterns(data):
    detector = HarmonicDetector(error_allowed=ERROR_MARGIN, strict=False)
    return detector.search_patterns(
                data,
                only_last=True,
                last_n=0,
            )

class HarmonicPatternIndicator(bt.Indicator):
    lines = ('harmonic_signal', 'take_profit_signal')

    # plotinfo = dict(plot=False, subplot=False)

    def __init__(self):
        data = pd.DataFrame(index=[bt.num2date(dt) for dt in self.data.datetime])
        data['open'] = np.array(self.data.open)
        data['high'] = np.array(self.data.high)
        data['low'] = np.array(self.data.low)
        data['close'] = np.array(self.data.close)
        data['volume'] = np.array(self.data.volume)

        patterns = get_patterns(data)

        harmonic_signal = []
        take_profit_signal = []

        for i in range(len(data)):
            matched_patterns = [pat for pat in patterns[0] if data.index[i] == pat[1][-1]]
            if len(matched_patterns) > 0:
                direction = matched_patterns[0][2].split(' ')[0]
                take_profit = matched_patterns[0][0][2][1]
                harmonic_signal.append(1 if direction == 'bullish' else -1)
                take_profit_signal.append(take_profit)
            else:
                harmonic_signal.append(0)
                take_profit_signal.append(0)

        # Set indicator values based on signals
        # self.lines.harmonic_signal[0] = sum(signal_map[signal] for _, signal in patterns)
        self.lines.harmonic_signal.array = harmonic_signal
        self.lines.take_profit_signal.array = take_profit_signal

class Harmonic(bt.Strategy):
    def log(self, txt, dt=None):
        ''' Logging function fot this strategy'''
        dt = dt or self.datas[0].datetime.datetime(0)
        print('%s, %s' % (dt.isoformat(), txt))

    def __init__(self):
        self.harmonic_indicator = HarmonicPatternIndicator()
        self.order_in_progress = False
    
    def notify_order(self, order):
        if order.status in [order.Submitted, order.Accepted]:
            # Buy/Sell order submitted/accepted to/by broker - Nothing to do
            return
        # Check if an order has been completed
        # Attention: broker could reject order if not enough cash
        if order.status in [order.Completed]:
            if order.isbuy():
                self.log(
                    'BUY EXECUTED, Price: %.2f, Cost: %.2f, Comm %.2f' %
                    (order.executed.price,
                     order.executed.value,
                     order.executed.comm))
                self.buyprice = order.executed.price
                self.buycomm = order.executed.comm
            else:  # Sell
                self.log('SELL EXECUTED, Price: %.2f, Cost: %.2f, Comm %.2f' %
                         (order.executed.price,
                          order.executed.value,
                          order.executed.comm))
            self.bar_executed = len(self)

        elif order.status in [order.Canceled, order.Margin, order.Rejected]:
            self.log('Order Canceled/Margin/Rejected')
        # Write down: no pending order
        self.order = None

    def notify_trade(self, trade):
        if not trade.isclosed:
            return
        self.log('OPERATION PROFIT, GROSS %.2f, NET %.2f' %
                 (trade.pnl, trade.pnlcomm))

    def next(self):
        harmonic_signal = self.harmonic_indicator.lines.harmonic_signal[0]
        take_profit_signal = self.harmonic_indicator.lines.take_profit_signal[0]
        # middle_pattern_value = current_pattern[0][0][2][1]
        # direction_string = current_pattern[0][2]
        # current_close = self.data.Close[-1]

        if harmonic_signal == 1:
            self.order_in_progress = True

            self.order = self.buy()
            take_profit_price = take_profit_signal
            stop_loss_price = self.data.close[0] - (take_profit_price - self.data.close[0])
            # self.sell(
            #     exectype=bt.Order.Limit,
            #     price=take_profit_price,
            #     parent=self.order
            # )
            # self.sell(
            #     exectype=bt.Order.Stop,
            #     price=stop_loss_price,
            #     parent=self.order
            # )
        elif harmonic_signal == -1:
            self.order_in_progress = True

            self.order = self.sell()
            take_profit_price = take_profit_signal
            stop_loss_price = self.data.close[0] + (self.data.close[0] - take_profit_price)
