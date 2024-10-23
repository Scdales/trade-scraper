mkdir ta-lib
cd ta-lib
mkdir build
curl -OL 'http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz'
tar -xf ta-lib-0.4.0-src.tar.gz
cd ta-lib
./configure --prefix=$(pwd)/../build
make
sudo make install
cd ../../
export TA_LIBRARY_PATH=$(pwd)/ta-lib/build/lib
export TA_INCLUDE_PATH=$(pwd)/ta-lib/build/include
pip install -r requirements.txt
