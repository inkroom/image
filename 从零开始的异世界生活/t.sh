ls=$(ls -r -m)
array=(`echo $ls | tr ',' ' '`)


i=0

cat ~/resource/temp/189 | while read line
do
mv ${array[$i]} "k$line.jpg"
echo "${array[$i]} - k$line.jpg"
i=$i+1
done


