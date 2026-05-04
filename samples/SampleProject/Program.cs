namespace SampleProject;

public class Program
{
    public static void Main(string[] args)
    {
        var service = new GreetingService();
        var message = service.Greet("World");
        Console.WriteLine(message);

        var calculator = new Calculator();
        Console.WriteLine($"2 + 3 = {calculator.Add(2, 3)}");
    }
}
